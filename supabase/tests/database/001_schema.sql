begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

select has_schema('private', 'private schema exists');
select has_table('public', 'profiles', 'profiles table exists');
select has_table('public', 'households', 'households table exists');
select has_table('public', 'memberships', 'memberships table exists');
select has_table('public', 'lists', 'lists table exists');
select has_table('public', 'tasks', 'tasks table exists');
select has_table('private', 'command_receipts', 'command receipts exist');
select has_table('private', 'invitations', 'invitations exist');
select has_table('private', 'system_secrets', 'database-only secret store exists');
select hasnt_column('public', 'lists', 'due_at', 'lists have no deadline');
select has_column('public', 'lists', 'notes', 'lists carry a shared note');
select col_is_null('public', 'lists', 'notes', 'the list note is optional');
select has_column('public', 'tasks', 'due_at', 'tasks have optional deadline');
select col_type_is('public', 'tasks', 'due_at', 'timestamp with time zone', 'deadline is timezone-aware');
select col_is_null('public', 'tasks', 'assignee_id', 'assignee is optional');
select col_is_null('public', 'tasks', 'due_at', 'deadline is optional');
select col_not_null('public', 'tasks', 'version', 'task version is required');
select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'profiles RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.households'::regclass), 'households RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.memberships'::regclass), 'memberships RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.lists'::regclass), 'lists RLS enabled');
select ok((select relrowsecurity from pg_class where oid = 'public.tasks'::regclass), 'tasks RLS enabled');
select ok(has_table_privilege('authenticated', 'public.tasks', 'SELECT'), 'authenticated can read tasks');
select ok(not has_table_privilege('authenticated', 'public.tasks', 'INSERT'), 'authenticated cannot insert tasks directly');
select ok(not has_table_privilege('authenticated', 'public.tasks', 'UPDATE'), 'authenticated cannot update tasks directly');
select ok(not has_table_privilege('authenticated', 'private.invitations', 'SELECT'), 'invites are never table-readable');
select has_function('public', 'create_list', array['uuid', 'text', 'text'], 'create_list RPC exists');
select has_function(
  'public', 'create_list_v2', array['uuid', 'text', 'text', 'text'],
  'note-aware create_list_v2 RPC exists'
);
select has_function(
  'public', 'save_list_template', array['uuid', 'uuid'],
  'save_list_template RPC exists'
);
select has_function('public', 'copy_template', array['uuid', 'uuid'], 'copy_template RPC exists');
select has_function('public', 'claim_task', array['uuid', 'uuid', 'bigint'], 'claim_task RPC exists');
select has_function('public', 'redeem_invitation', array['uuid', 'text'], 'redeem_invitation RPC exists');

select * from finish();
rollback;
