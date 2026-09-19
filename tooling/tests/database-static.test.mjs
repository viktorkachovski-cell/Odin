import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaFiles = [
  'supabase/schemas/00_core.sql',
  'supabase/schemas/01_security.sql',
  'supabase/schemas/02_commands.sql',
  'supabase/schemas/03_reads.sql',
  'supabase/schemas/04_grants_and_realtime.sql',
];

const schema = (await Promise.all(schemaFiles.map((file) => readFile(file, 'utf8')))).join('\n');

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
