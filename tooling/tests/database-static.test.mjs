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

test('database schema preserves product boundaries', () => {
  const listTable = schema.match(/create table public\.lists \(([\s\S]*?)\n\);/i)?.[1];
  assert.ok(listTable, 'lists table declaration missing');
  assert.doesNotMatch(listTable, /\bdue_at\b/i, 'lists must not have deadlines');
  assert.match(schema, /constraint tasks_assignee_membership_fk/i);
  assert.match(schema, /template tasks cannot carry runtime state/i);
  assert.match(schema, /memberships_one_active_household_per_user_idx/i);
});

test('every exposed table enables RLS and direct client writes stay revoked', () => {
  for (const table of ['profiles', 'households', 'memberships', 'lists', 'tasks']) {
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
