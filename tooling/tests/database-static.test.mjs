import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

const schemaFiles = [
  'supabase/schemas/00_core.sql',
  'supabase/schemas/01_security.sql',
  'supabase/schemas/02_commands.sql',
  'supabase/schemas/03_reads.sql',
  'supabase/schemas/04_grants_and_realtime.sql',
];

const schema = (await Promise.all(schemaFiles.map((file) => readFile(file, 'utf8')))).join('\n');
const lifecycleMigration = await readFile(
  'supabase/migrations/20260921180000_delete_list_task_commands.sql',
  'utf8',
);
const taskFeaturesMigration = await readFile(
  'supabase/migrations/20260921180500_task_notes_templates.sql',
  'utf8',
);
const listTemplateMigration = await readFile(
  'supabase/migrations/20260922120000_list_templates_and_notes.sql',
  'utf8',
);
const deletableTemplateMigration = await readFile(
  'supabase/migrations/20260922140000_deletable_list_templates.sql',
  'utf8',
);
const assigneesMigration = await readFile(
  'supabase/migrations/20261104190000_multiple_task_assignees.sql',
  'utf8',
);
const projectsMigration = await readFile('supabase/migrations/20261109120000_projects.sql', 'utf8');

test('database schema preserves product boundaries', () => {
  const listTable = schema.match(/create table public\.lists \(([\s\S]*?)\n\);/i)?.[1];
  assert.ok(listTable, 'lists table declaration missing');
  assert.doesNotMatch(listTable, /\bdue_at\b/i, 'lists must not have deadlines');
  assert.match(schema, /constraint tasks_assignee_membership_fk/i);
  assert.match(schema, /template tasks cannot carry runtime state/i);
  assert.match(schema, /memberships_one_active_household_per_user_idx/i);
});

test('every exposed table enables RLS and direct client writes stay revoked', () => {
  for (const table of [
    'profiles',
    'households',
    'memberships',
    'projects',
    'lists',
    'tasks',
    'task_assignees',
  ]) {
    assert.match(
      schema,
      new RegExp(`alter table public\\.${table} enable row level security`, 'i'),
    );
  }
  assert.match(schema, /revoke all on all tables in schema public from anon, authenticated/i);
  assert.doesNotMatch(schema, /grant\s+(?:all|insert|update|delete)[^;]*to authenticated/i);
});

test('RPC and privileged helper boundaries are explicit', () => {
  const publicFunctions = [
    ...schema.matchAll(/create or replace function public\.([a-z_]+)[\s\S]*?\$\$;/gi),
  ];
  assert.ok(publicFunctions.length >= 18, 'expected public RPC surface');
  for (const match of publicFunctions) {
    assert.match(match[0], /security invoker/i, `${match[1]} must be security invoker`);
    assert.match(match[0], /set search_path = ''/i, `${match[1]} must pin search_path`);
  }
  assert.doesNotMatch(schema, /grant[^;]+to anon/i);
  assert.doesNotMatch(schema, /service_role/i);
  for (const helper of ['error_response', 'ok_response', 'encode_cursor', 'decode_cursor']) {
    assert.match(
      schema,
      new RegExp(`grant execute on function private\\.${helper}\\(`, 'i'),
      `${helper} must be callable through invoker reads`,
    );
  }
});

test('idempotency, conflict and invitation secrecy controls exist', () => {
  assert.match(schema, /primary key \(actor_user_id, request_id\)/i);
  assert.match(schema, /IDEMPOTENCY_MISMATCH/i);
  assert.match(schema, /expected_version/i);
  assert.match(schema, /token_hash bytea not null unique/i);
  assert.match(schema, /private\.invitation_secret\(\)/i);
  assert.doesNotMatch(schema, /raw_token/i);
});

test('read helpers keep cursor and CTE semantics valid', () => {
  assert.match(
    schema,
    /function private\.decode_cursor\([\s\S]*?language plpgsql\s+stable\b/i,
    'cursor decoding must not claim immutable volatility',
  );
  assert.doesNotMatch(
    schema,
    /into v_items from visible;\s*select id into v_last from visible/i,
    'a CTE must not be referenced by a later SQL statement',
  );
});

test('list and task lifecycle commands preserve version and household boundaries', () => {
  assert.match(lifecycleMigration, /create or replace function private\.delete_list/i);
  assert.match(lifecycleMigration, /create or replace function private\.delete_task/i);
  assert.match(lifecycleMigration, /p_expected_version\s+bigint/i);
  assert.match(lifecycleMigration, /status = 'archived'/i);
  assert.match(lifecycleMigration, /delete from public\.tasks/i);
  assert.match(lifecycleMigration, /lock_active_members\(v_household, array\[v_actor\]\)/i);
  assert.match(lifecycleMigration, /revoke all on function public\.delete_list/i);
  assert.match(lifecycleMigration, /revoke all on function public\.delete_task/i);
});

test('task notes and household templates preserve validation and authorization boundaries', () => {
  assert.match(taskFeaturesMigration, /char_length\(title\) between 1 and 500/i);
  assert.match(taskFeaturesMigration, /char_length\(notes\) <= 5000/i);
  assert.match(
    taskFeaturesMigration,
    /alter table public\.task_templates enable row level security/i,
  );
  assert.match(
    taskFeaturesMigration,
    /private\.lock_active_members\(v_household, array\[v_actor\]\)/i,
  );
  assert.match(taskFeaturesMigration, /where household_id = private\.active_household_id\(\)/i);
  assert.match(
    taskFeaturesMigration,
    /revoke all on function public\.save_task_template[^;]+from public, anon/i,
  );
  assert.match(taskFeaturesMigration, /p_expected_version bigint/i);
  assert.match(taskFeaturesMigration, /'update_task_v2'/i);
});

test('list templates and list notes keep their documented boundaries', () => {
  // A list template and a task template are separate types: saving a list must
  // never write public.task_templates, or a task template stops being loadable
  // on its own.
  assert.match(listTemplateMigration, /create or replace function private\.save_list_template/i);
  assert.doesNotMatch(
    listTemplateMigration,
    /insert into public\.task_templates/i,
    'saving a list must not create task templates',
  );
  assert.match(listTemplateMigration, /kind = 'active' and status = 'open'/i);
  assert.match(
    listTemplateMigration,
    /insert into public\.tasks \(household_id, list_id, title, sort_order, notes\)/i,
    'a saved template copies task text and order only',
  );
  assert.match(listTemplateMigration, /char_length\(notes\) <= 5000/i);
  assert.match(
    listTemplateMigration,
    /private\.lock_active_members\(v_household, array\[v_actor\]\)/i,
  );
  assert.match(listTemplateMigration, /'update_list_v2'/i);
  assert.match(
    listTemplateMigration,
    /revoke all on function public\.save_list_template[^;]+from public, anon/i,
  );
  assert.match(schema, /constraint lists_notes_normalized/i);
  assert.doesNotMatch(
    schema,
    /constraint lists_template_seed_key/i,
    'member-saved templates carry no seed key',
  );
});

// The declaration only, so a `-- previously required kind = 'active'` comment
// above it cannot satisfy or break an assertion about the code.
function deleteListDeclaration(source, label) {
  const match = source.match(
    /CREATE OR REPLACE FUNCTION private\.delete_list \([\s\S]*?\n\$function\$;/i,
  )?.[0];
  assert.ok(match, `delete_list declaration missing from ${label}`);
  return match;
}

test('a template is deletable, and deleting any list still archives it', () => {
  for (const [label, source] of [
    ['the declarative schema', schema],
    ['its migration', deletableTemplateMigration],
  ]) {
    const deleteList = deleteListDeclaration(source, label);
    assert.doesNotMatch(
      deleteList,
      /kind = 'active'/i,
      `delete_list in ${label} must accept a template as well as an active list`,
    );
    // Archiving, not dropping: the tasks inside a removed list stay
    // recoverable, and get_home/copy_template already filter on status.
    assert.match(deleteList, /update public\.lists set status = 'archived'/i);
    assert.doesNotMatch(deleteList, /delete from public\.lists/i);
    assert.match(deleteList, /status = 'open'/i);
    assert.match(deleteList, /v_list\.version <> p_expected_version/i);
  }
});

test('task assignments are a normalized, household-bound, directly unreachable relation', () => {
  const table = schema.match(/create table public\.task_assignees \(([\s\S]*?)\n\);/i)?.[1];
  assert.ok(table, 'task_assignees declaration missing');
  assert.match(table, /primary key \(task_id, user_id\)/i, 'one row per member per task');
  assert.match(
    table,
    /foreign key \(household_id, task_id\)\s+references public\.tasks\(household_id, id\)/i,
  );
  assert.match(
    table,
    /foreign key \(household_id, user_id\)\s+references public\.memberships\(household_id, user_id\)/i,
  );
  assert.match(schema, /active household member/i, 'a trigger enforces active membership');
  assert.match(schema, /for share/i, 'assignment serialises with membership revocation');
  // No policy and no grant: assignments reach clients only inside task payloads.
  assert.doesNotMatch(schema, /on public\.task_assignees\s+for\s+select/i);
  assert.doesNotMatch(schema, /grant[^;]+on[^;]*public\.task_assignees[^;]*to authenticated/i);
  assert.match(schema, /constraint trigger tasks_assignee_projection/i);
  assert.match(schema, /constraint trigger task_assignees_projection/i);
});

test('the assignee migration copies every assignment before it constrains anything', () => {
  const backfill = assigneesMigration.search(/insert into public\.task_assignees/i);
  const firstTrigger = assigneesMigration.search(/create trigger task_assignees_validate/i);
  const firstConstraintTrigger = assigneesMigration.search(/create constraint trigger/i);
  assert.ok(backfill > 0, 'migration must backfill existing assignments');
  assert.ok(backfill < firstTrigger, 'backfill must precede the validating trigger');
  assert.ok(backfill < firstConstraintTrigger, 'backfill must precede the projection trigger');
  assert.match(assigneesMigration, /where assignee_id is not null/i);
  assert.match(
    assigneesMigration,
    /assignment backfill copied/i,
    'migration verifies its own copy',
  );
  // The backfill must not touch tasks: versions and timestamps stay put.
  const beforeTriggers = assigneesMigration.slice(0, firstTrigger);
  assert.doesNotMatch(beforeTriggers, /update public\.tasks/i);
  assert.doesNotMatch(assigneesMigration, /drop column|alter table public\.tasks\s+drop/i);
});

test('the assignee migration keeps new commands signed-in only', () => {
  assert.match(
    assigneesMigration,
    /revoke all on public\.task_assignees from public, anon, authenticated/i,
  );
  for (const fn of [
    'create_task_v3',
    'update_task_v3',
    'set_task_assignees',
    'add_task_assignee',
    'remove_task_assignee',
    'get_task_v2',
  ]) {
    for (const scope of ['public', 'private']) {
      assert.match(
        assigneesMigration,
        new RegExp(`revoke all on function ${scope}\\.${fn}\\([^)]*\\) from public, anon;`, 'i'),
        `${scope}.${fn} must not be callable by anon or PUBLIC`,
      );
      assert.match(
        assigneesMigration,
        new RegExp(`grant execute on function ${scope}\\.${fn}\\([^)]*\\) to authenticated;`, 'i'),
        `${scope}.${fn} must be granted to authenticated only`,
      );
    }
  }
  assert.doesNotMatch(assigneesMigration, /grant[^;]*\bto\s+(anon|public)\b/i);
});

test('assignment commands canonicalise sets and keep one receipt identity', () => {
  for (const command of ['create_task_v3', 'update_task_v3', 'set_task_assignees']) {
    const body = schema.match(
      new RegExp(`create or replace function private\\.${command}\\([\\s\\S]*?\\n\\$\\$;`, 'i'),
    )?.[0];
    assert.ok(body, `${command} missing`);
    assert.match(body, /canonical_assignee_ids\(p_assignee_ids\)/i, `${command} canonicalises`);
    assert.match(body, /to_jsonb\(v_ids\)/i, `${command} hashes the canonical set`);
    assert.match(body, new RegExp(`replay_command\\(v_actor, p_request_id, '${command}'`, 'i'));
  }
  const addRemove = schema.match(/function private\.add_task_assignee[\s\S]*?\n\$\$;/i)?.[0] ?? '';
  assert.doesNotMatch(addRemove, /p_expected_version/i, 'adding one member carries no version');
});

test('every collected database test declares a pgTAP plan', async () => {
  // `supabase test db` hands every .sql under supabase/tests/ to pg_prove, which
  // fails a file emitting no TAP plan with "No plan found in TAP output" -- the
  // whole workflow goes red without a single assertion having failed. Scripts
  // that assert by raising instead belong in supabase/smoke/.
  const root = 'supabase/tests';
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const collected = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name));

  assert.ok(collected.length > 0, 'expected at least one pgTAP test to be collected');

  for (const file of collected) {
    const body = await readFile(file, 'utf8');
    assert.match(
      body,
      /select\s+plan\(/i,
      `${file} is collected by pg_prove but declares no plan()`,
    );
    assert.match(body, /finish\(\)/i, `${file} declares a plan but never calls finish()`);
  }
});

test('smoke scripts stay outside the collected test tree', async () => {
  const entries = await readdir('supabase/smoke', { withFileTypes: true });
  const scripts = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.sql'));
  assert.ok(scripts.length > 0, 'expected smoke scripts under supabase/smoke');

  for (const entry of scripts) {
    const body = await readFile(join('supabase/smoke', entry.name), 'utf8');
    assert.doesNotMatch(
      body,
      /select\s+plan\(/i,
      `${entry.name} declares a pgTAP plan, so it belongs under supabase/tests/`,
    );
  }
});

test('projects group active lists without owning, deleting or exposing them', () => {
  // The project is only a name: no deadline, status or order of its own.
  const projectTable = schema.match(/create table public\.projects \(([\s\S]*?)\n\);/i)?.[1];
  assert.ok(projectTable, 'projects table declaration missing');
  assert.doesNotMatch(projectTable, /\b(due_at|status|sort_order)\b/i);

  // A template is never in a project, and the link is household-scoped.
  assert.match(
    schema,
    /constraint lists_project_active_only check \(project_id is null or kind = 'active'\)/i,
  );
  assert.match(
    schema,
    /foreign key \(household_id, project_id\)\s+references public\.projects \(household_id, id\)/i,
  );

  // Deleting a project ungroups its lists; it must never delete or archive one.
  const deleteProject = schema.match(
    /create or replace function private\.delete_project\([\s\S]*?\n\$\$;/i,
  )?.[0];
  assert.ok(deleteProject, 'delete_project missing');
  assert.match(deleteProject, /update public\.lists set project_id = null/i);
  assert.doesNotMatch(deleteProject, /delete from public\.(lists|tasks)/i);
  assert.doesNotMatch(deleteProject, /status = 'archived'/i);
});

function helperBody(name) {
  return projectsMigration.match(
    new RegExp(`create or replace function private\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, 'i'),
  )?.[0];
}

test('project commands keep the actor, version and grant boundaries', () => {
  for (const name of [
    'create_project',
    'update_project',
    'delete_project',
    'create_list_v3',
    'set_list_project',
  ]) {
    const helper = helperBody(name);
    assert.ok(helper, `${name} helper missing from the projects migration`);
    assert.match(helper, /security definer/i);
    assert.match(helper, /set search_path = ''/i);
    assert.match(helper, /v_actor uuid := auth\.uid\(\)/i);
    assert.match(helper, /private\.lock_active_members\(v_household, array\[v_actor\]\)/i);
    assert.match(helper, /private\.replay_command\(/i);
    assert.match(
      projectsMigration,
      new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon`, 'i'),
    );
    assert.match(
      projectsMigration,
      new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to authenticated`, 'i'),
    );
    assert.match(schema, new RegExp(`function private\\.${name}\\(`, 'i'));
  }
  for (const name of ['update_project', 'delete_project', 'set_list_project']) {
    assert.match(
      helperBody(name) ?? '',
      /p_expected_version bigint/i,
      `${name} must check the version the member saw`,
    );
  }
  assert.match(
    projectsMigration,
    /revoke all on public\.projects from public, anon, authenticated/i,
  );
  assert.match(projectsMigration, /grant select on public\.projects to authenticated/i);
  assert.doesNotMatch(projectsMigration, /grant[^;]+to anon/i);
});
