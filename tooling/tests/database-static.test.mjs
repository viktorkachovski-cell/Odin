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

// One function's current declaration only, so text elsewhere in the schema --
// a comment, or another function -- cannot satisfy or break an assertion about
// it. Published migrations are frozen, so assertions read the declarative
// schema, the only place a regression can appear.
function declaration(name) {
  const pattern = new RegExp(
    `create or replace function ${name.replace('.', '\\.')}\\s*\\([\\s\\S]*?\\n\\$(?:function)?\\$;`,
    'i',
  );
  const match = schema.match(pattern)?.[0];
  assert.ok(match, `${name} declaration missing from the schema`);
  return match;
}

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
  // Every function starts revoked; each RPC is then granted to authenticated
  // by name, so nothing is callable that was not deliberately exposed.
  assert.match(
    schema,
    /revoke all on all functions in schema public from public, anon, authenticated/i,
  );
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
  for (const name of ['delete_list', 'delete_task']) {
    const helper = declaration(`private.${name}`);
    assert.match(helper, /p_expected_version\s+bigint/i, `${name} must take an expected version`);
    assert.match(
      helper,
      /lock_active_members\(v_household, array\[v_actor\]\)/i,
      `${name} must re-check active membership`,
    );
    assert.match(
      schema,
      new RegExp(
        `grant execute on function public\\.${name}\\(uuid, uuid, bigint\\) to authenticated;`,
        'i',
      ),
    );
  }
  assert.match(declaration('private.delete_task'), /delete from public\.tasks/i);
});

test('task notes and household templates preserve validation and authorization boundaries', () => {
  assert.match(schema, /char_length\(title\) between 1 and 500/i);
  assert.match(schema, /char_length\(notes\) <= 5000/i);
  assert.match(schema, /alter table public\.task_templates enable row level security/i);
  assert.match(schema, /where household_id = private\.active_household_id\(\)/i);
  assert.match(
    declaration('private.save_task_template'),
    /private\.lock_active_members\(v_household, array\[v_actor\]\)/i,
  );
  assert.match(
    schema,
    /grant execute on function public\.save_task_template\(uuid, text, text\) to authenticated;/i,
  );
  const updateTask = declaration('private.update_task_v2');
  assert.match(updateTask, /p_expected_version bigint/i);
  assert.match(updateTask, /'update_task_v2'/i);
});

test('list templates and list notes keep their documented boundaries', () => {
  const saveListTemplate = declaration('private.save_list_template');
  // A list template and a task template are separate types: saving a list must
  // never write public.task_templates, or a task template stops being loadable
  // on its own.
  assert.doesNotMatch(
    saveListTemplate,
    /insert into public\.task_templates/i,
    'saving a list must not create task templates',
  );
  assert.match(saveListTemplate, /kind = 'active' and status = 'open'/i);
  assert.match(
    saveListTemplate,
    /insert into public\.tasks \(household_id, list_id, title, sort_order, notes\)/i,
    'a saved template copies task text and order only',
  );
  assert.match(saveListTemplate, /private\.lock_active_members\(v_household, array\[v_actor\]\)/i);
  assert.match(declaration('private.update_list_v2'), /'update_list_v2'/i);
  assert.match(
    schema,
    /grant execute on function public\.save_list_template\(uuid, uuid\) to authenticated;/i,
  );
  assert.match(schema, /constraint lists_notes_normalized/i);
  assert.doesNotMatch(
    schema,
    /constraint lists_template_seed_key/i,
    'member-saved templates carry no seed key',
  );
});

test('a template is deletable, and deleting any list still archives it', () => {
  const deleteList = declaration('private.delete_list');
  assert.doesNotMatch(
    deleteList,
    /kind = 'active'/i,
    'delete_list must accept a template as well as an active list',
  );
  // Archiving, not dropping: the tasks inside a removed list stay
  // recoverable, and get_home/copy_template already filter on status.
  assert.match(deleteList, /update public\.lists set status = 'archived'/i);
  assert.doesNotMatch(deleteList, /delete from public\.lists/i);
  assert.match(deleteList, /status = 'open'/i);
  assert.match(deleteList, /v_list\.version <> p_expected_version/i);
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
