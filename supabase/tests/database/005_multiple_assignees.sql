begin;
create extension if not exists pgtap with schema extensions;
select plan(103);

-- Fixtures are inserted as the table owner. Everything under test runs as the
-- `authenticated` role with a JWT subject, exactly as a client does.
insert into auth.users (id, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select id::uuid, 'authenticated', 'authenticated', '{}', '{}', now(), now()
from (values
  ('51000000-0000-0000-0000-00000000000a'),
  ('51000000-0000-0000-0000-00000000000b'),
  ('51000000-0000-0000-0000-00000000000c'),
  ('51000000-0000-0000-0000-00000000000d'),
  ('51000000-0000-0000-0000-00000000000e'),
  ('51000000-0000-0000-0000-00000000000f')
) as u(id);

insert into public.profiles (user_id, display_name)
select id::uuid, name
from (values
  ('51000000-0000-0000-0000-00000000000a', 'Ana'),
  ('51000000-0000-0000-0000-00000000000b', 'Boris'),
  ('51000000-0000-0000-0000-00000000000c', 'Cara'),
  ('51000000-0000-0000-0000-00000000000d', 'Dani'),
  ('51000000-0000-0000-0000-00000000000e', 'Elis'),
  ('51000000-0000-0000-0000-00000000000f', 'Fay')
) as p(id, name);

insert into public.households (id, name, seed_locale, created_by) values
  ('52000000-0000-0000-0000-000000000001', 'Home one', 'en', '51000000-0000-0000-0000-00000000000a'),
  ('52000000-0000-0000-0000-000000000002', 'Home two', 'en', '51000000-0000-0000-0000-00000000000d');

-- Ana, Boris, Cara and Elis live in home one; Dani and Fay in home two.
insert into public.memberships (household_id, user_id) values
  ('52000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-00000000000a'),
  ('52000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-00000000000b'),
  ('52000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-00000000000c'),
  ('52000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-00000000000e'),
  ('52000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-00000000000d'),
  ('52000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-00000000000f');

insert into public.lists (id, household_id, kind, title, created_by) values
  ('53000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', 'active', 'Chores', '51000000-0000-0000-0000-00000000000a'),
  ('53000000-0000-0000-0000-000000000002', '52000000-0000-0000-0000-000000000001', 'template', 'Routine', '51000000-0000-0000-0000-00000000000a'),
  ('53000000-0000-0000-0000-000000000003', '52000000-0000-0000-0000-000000000002', 'active', 'Other home', '51000000-0000-0000-0000-00000000000d');

create temporary table fixture_state (key text primary key, value text not null);
grant all on fixture_state to authenticated;
create function public.tid(k text) returns uuid language sql stable
as $$ select value::uuid from fixture_state where key = k $$;

-- Structure -----------------------------------------------------------------

select has_table('public', 'task_assignees', 'assignments are a relation of their own');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.task_assignees'::regclass),
  'task_assignees has row level security'
);
select is(
  has_table_privilege('authenticated', 'public.task_assignees', 'select')
    or has_table_privilege('authenticated', 'public.task_assignees', 'insert')
    or has_table_privilege('anon', 'public.task_assignees', 'select'),
  false,
  'clients hold no direct privilege on task_assignees'
);
select is(
  has_function_privilege('anon', 'public.add_task_assignee(uuid,uuid,uuid)', 'execute')
    or has_function_privilege('anon', 'public.set_task_assignees(uuid,uuid,bigint,uuid[])', 'execute')
    or has_function_privilege('anon', 'public.get_task_v2(uuid)', 'execute'),
  false,
  'anon cannot execute the assignment commands or the task read'
);
select is(
  has_function_privilege('authenticated', 'private.task_json(jsonb,uuid)', 'execute')
    or has_function_privilege('authenticated', 'private.assignee_ids(uuid)', 'execute'),
  false,
  'the assignment read helpers are not callable by clients'
);

-- Creation: zero, one and several assignees ---------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-00000000000a', true);

insert into fixture_state values ('t_zero', public.create_task_v3(
  '60000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000001', 'Nobody yet'
) #>> '{data,id}');
select is(
  (public.create_task_v3('60000000-0000-0000-0000-000000000001',
    '53000000-0000-0000-0000-000000000001', 'Nobody yet') #>> '{data,assignee_ids}'),
  '[]',
  'zero assignees is an empty set (and the same request returns the same task)'
);

insert into fixture_state values ('t_one', public.create_task_v3(
  '60000000-0000-0000-0000-000000000002', '53000000-0000-0000-0000-000000000001', 'Solo',
  array['51000000-0000-0000-0000-00000000000b']::uuid[]
) #>> '{data,id}');
select is(
  (public.get_task_v2(public.tid('t_one')) #>> '{data,assignee_ids}'),
  '["51000000-0000-0000-0000-00000000000b"]',
  'one assignee'
);

-- Two assignees sent out of order and with a repeat: stored once each, ascending.
insert into fixture_state values ('t_two', public.create_task_v3(
  '60000000-0000-0000-0000-000000000003', '53000000-0000-0000-0000-000000000001', 'Pair',
  array['51000000-0000-0000-0000-00000000000b','51000000-0000-0000-0000-00000000000a',
        '51000000-0000-0000-0000-00000000000b']::uuid[],
  '2026-12-01T10:00:00Z', 'shared note'
) #>> '{data,id}');
select is(
  (public.get_task_v2(public.tid('t_two')) #>> '{data,assignee_ids}'),
  '["51000000-0000-0000-0000-00000000000a", "51000000-0000-0000-0000-00000000000b"]',
  'several assignees are distinct and ordered by user id'
);
select is(
  (public.get_task_v2(public.tid('t_two')) #>> '{data,version}'), '1',
  'creating a task with assignees leaves it at version 1'
);

-- One task, once, in each assignee's Mine and in Everyone ------------------

select is(
  (select count(*)::integer from jsonb_array_elements(public.get_my_tasks_v2() #> '{data,items}') i
    where i ->> 'id' = public.tid('t_two')::text),
  1, 'Ana sees the pair task once in Mine'
);
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-00000000000b', true);
select is(
  (select count(*)::integer from jsonb_array_elements(public.get_my_tasks_v2() #> '{data,items}') i
    where i ->> 'id' = public.tid('t_two')::text),
  1, 'Boris sees the pair task once in Mine'
);
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-00000000000c', true);
select is(
  (select count(*)::integer from jsonb_array_elements(public.get_my_tasks_v2() #> '{data,items}') i
    where i ->> 'id' = public.tid('t_two')::text),
  0, 'Cara, who is not assigned, does not see it in Mine'
);
select is(
  (select count(*)::integer from jsonb_array_elements(public.get_all_tasks() #> '{data,items}') i
    where i ->> 'id' = public.tid('t_two')::text),
  1, 'the task appears once in Everyone even with two assignees'
);
select is(
  (public.get_list_v2('53000000-0000-0000-0000-000000000001') #>> '{data,total_tasks}')::integer,
  3, 'two assignees do not multiply the list total'
);
select is(
  (select (i ->> 'total_tasks')::integer from jsonb_array_elements(public.get_home_v2() #> '{data,items}') i
    where i ->> 'id' = '53000000-0000-0000-0000-000000000001'),
  3, 'the household summary counts each task once'
);
select is(
  (select count(*)::integer from jsonb_array_elements(public.get_unassigned_v2() #> '{data,items}') i
    where i ->> 'id' in (public.tid('t_one')::text, public.tid('t_two')::text)),
  0, 'assigned tasks are not unassigned'
);

-- add / remove one member ---------------------------------------------------

select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-00000000000a', true);

select is(
  (public.add_task_assignee('60000000-0000-0000-0000-000000000010', public.tid('t_two'),
    '51000000-0000-0000-0000-00000000000c') #>> '{data,assignee_ids}'),
  '["51000000-0000-0000-0000-00000000000a", "51000000-0000-0000-0000-00000000000b", "51000000-0000-0000-0000-00000000000c"]',
  'adding Cara preserves Ana and Boris'
);
select is(
  (public.get_task_v2(public.tid('t_two')) #>> '{data,version}'), '2',
  'adding an assignee advances the version once'
);
select is(
  (public.add_task_assignee('60000000-0000-0000-0000-000000000011', public.tid('t_two'),
    '51000000-0000-0000-0000-00000000000c') #>> '{data,version}'), '2',
  'adding someone already assigned is a successful no-op that keeps the version'
);
select is(
  (public.remove_task_assignee('60000000-0000-0000-0000-000000000012', public.tid('t_two'),
    '51000000-0000-0000-0000-00000000000a') #>> '{data,assignee_ids}'),
  '["51000000-0000-0000-0000-00000000000b", "51000000-0000-0000-0000-00000000000c"]',
  'removing Ana preserves Boris and Cara'
);
select is(
  (public.get_task_v2(public.tid('t_two')) #>> '{data,version}'), '3',
  'removing an assignee advances the version once'
);
select is(
  (public.remove_task_assignee('60000000-0000-0000-0000-000000000013', public.tid('t_two'),
    '51000000-0000-0000-0000-00000000000a') #>> '{data,version}'), '3',
  'removing someone who is not assigned is a successful no-op'
);

-- A member who is not assigned can add and remove others, and add herself
-- onto an already-assigned incomplete task ("Assign to me").
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-00000000000e', true);
select is(
  (public.add_task_assignee('60000000-0000-0000-0000-000000000014', public.tid('t_two'),
    '51000000-0000-0000-0000-00000000000e') #>> '{data,assignee_ids}'),
  '["51000000-0000-0000-0000-00000000000b", "51000000-0000-0000-0000-00000000000c", "51000000-0000-0000-0000-00000000000e"]',
  'Assign to me adds the caller without removing existing assignees'
);
select is(
  (public.remove_task_assignee('60000000-0000-0000-0000-000000000015', public.tid('t_two'),
    '51000000-0000-0000-0000-00000000000e') #>> '{data,assignee_ids}'),
  '["51000000-0000-0000-0000-00000000000b", "51000000-0000-0000-0000-00000000000c"]',
  'Remove me removes only the caller'
);

-- Replacing the whole set / clearing everyone -------------------------------

select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-00000000000a', true);
select is(
  (public.set_task_assignees('60000000-0000-0000-0000-000000000016', public.tid('t_two'), 5,
    array['51000000-0000-0000-0000-00000000000c','51000000-0000-0000-0000-00000000000a']::uuid[])
    #>> '{data,assignee_ids}'),
  '["51000000-0000-0000-0000-00000000000a", "51000000-0000-0000-0000-00000000000c"]',
  'replacing the set stores exactly the new set'
);
select is(
  (public.get_task_v2(public.tid('t_two')) #>> '{data,version}'), '6',
  'a replacement advances the version once'
);
select is(
  (public.get_task_v2(public.tid('t_two')) #>> '{data,notes}'), 'shared note',
  'replacing assignees leaves notes alone'
);
select is(
  (public.set_task_assignees('60000000-0000-0000-0000-000000000017', public.tid('t_two'), 6,
    array['51000000-0000-0000-0000-00000000000c','51000000-0000-0000-0000-00000000000a']::uuid[])
    #>> '{data,version}'),
  '6',
  'replacing with the same set keeps the version'
);
select is(
  (public.set_task_assignees('60000000-0000-0000-0000-000000000018', public.tid('t_two'), 6,
    '{}'::uuid[]) #>> '{data,assignee_ids}'),
  '[]',
  'an empty set clears everyone'
);
select is(
  (select count(*)::integer from jsonb_array_elements(public.get_unassigned_v2() #> '{data,items}') i
    where i ->> 'id' = public.tid('t_two')::text),
  1, 'a cleared incomplete task moves to Unassigned'
);
select is(
  (select count(*)::integer from jsonb_array_elements(public.get_my_tasks_v2() #> '{data,items}') i
    where i ->> 'id' = public.tid('t_two')::text),
  0, 'and leaves Ana''s Mine'
);

-- Completion and Blocked are shared and survive assignment edits -----------

select public.set_task_assignees('60000000-0000-0000-0000-000000000019', public.tid('t_two'), 7,
  array['51000000-0000-0000-0000-00000000000a','51000000-0000-0000-0000-00000000000b']::uuid[]);
select is(
  (public.set_task_state('60000000-0000-0000-0000-000000000020', public.tid('t_two'), 8, 'blocked')
    #>> '{data,blocked}'),
  'true', 'the task is blocked'
);
select is(
  (public.add_task_assignee('60000000-0000-0000-0000-000000000021', public.tid('t_two'),
    '51000000-0000-0000-0000-00000000000c') #>> '{data,blocked}'),
  'true', 'adding an assignee preserves Blocked'
);
select is(
  (public.update_task_v3('60000000-0000-0000-0000-000000000022', public.tid('t_two'), 10, 'Pair, renamed',
    array['51000000-0000-0000-0000-00000000000a']::uuid[], '2026-12-02T10:00:00Z', 'edited')
    #>> '{data,blocked}'),
  'true', 'the editor replacing the set preserves Blocked'
);
select is(
  (public.remove_task_assignee('60000000-0000-0000-0000-000000000023', public.tid('t_two'),
    '51000000-0000-0000-0000-00000000000a') #>> '{data,blocked}'),
  'true', 'removing the last assignee preserves Blocked'
);
select is(
  (public.get_task_v2(public.tid('t_two')) #>> '{data,assignee_ids}'), '[]',
  'a blocked task with nobody assigned simply has an empty set'
);

-- Any member completes for everyone; reopening keeps the assignments.
select public.update_task_v3('60000000-0000-0000-0000-000000000024', public.tid('t_two'), 12, 'Pair, renamed',
  array['51000000-0000-0000-0000-00000000000a','51000000-0000-0000-0000-00000000000b']::uuid[],
  '2026-12-02T10:00:00Z', 'edited');
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-00000000000e', true);
select is(
  (public.set_task_completed('60000000-0000-0000-0000-000000000025', public.tid('t_two'), 13, true)
    #>> '{data,completed}'),
  'true', 'a member who is not an assignee completes it for everyone'
);
select is(
  (public.get_task_v2(public.tid('t_two')) #>> '{data,assignee_ids}'),
  '["51000000-0000-0000-0000-00000000000a", "51000000-0000-0000-0000-00000000000b"]',
  'completion leaves the assignments in place'
);
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-00000000000b', true);
select is(
  (select count(*)::integer from jsonb_array_elements(public.get_my_tasks_v2() #> '{data,items}') i
    where i ->> 'id' = public.tid('t_two')::text),
  0, 'a done task leaves every assignee''s Mine'
);
select is(
  (public.set_task_completed('60000000-0000-0000-0000-000000000026', public.tid('t_two'), 14, false)
    #>> '{data,assignee_ids}'),
  '["51000000-0000-0000-0000-00000000000a", "51000000-0000-0000-0000-00000000000b"]',
  'reopening keeps both assignees'
);
select is(
  (select count(*)::integer from jsonb_array_elements(public.get_my_tasks_v2() #> '{data,items}') i
    where i ->> 'id' = public.tid('t_two')::text),
  1, 'and the reopened task is back in Boris''s Mine, once'
);
select is(
  (public.get_list_v2('53000000-0000-0000-0000-000000000001') #>> '{data,completed_tasks}')::integer,
  0, 'a reopened shared task counts as not completed exactly once'
);

-- Rejections are atomic and non-disclosing ----------------------------------

select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-00000000000a', true);
select is(
  (public.create_task_v3('60000000-0000-0000-0000-000000000030', '53000000-0000-0000-0000-000000000001',
    'Rejected', array['51000000-0000-0000-0000-00000000000b','51000000-0000-0000-0000-00000000000d']::uuid[])
    #>> '{error,code}'),
  'VALIDATION', 'a member of another household is rejected'
);
select is(
  (public.create_task_v3('60000000-0000-0000-0000-000000000031', '53000000-0000-0000-0000-000000000001',
    'Rejected', array['51000000-0000-0000-0000-00000000000b','51000000-0000-0000-0000-0000000000ff']::uuid[])
    #>> '{error,message_key}'),
  (public.create_task_v3('60000000-0000-0000-0000-000000000032', '53000000-0000-0000-0000-000000000001',
    'Rejected', array['51000000-0000-0000-0000-00000000000b','51000000-0000-0000-0000-00000000000d']::uuid[])
    #>> '{error,message_key}'),
  'an unknown user and a user from another household are indistinguishable'
);
select is(
  (select count(*)::integer from public.tasks where title = 'Rejected'),
  0, 'a rejected create leaves no task behind'
);

reset role;
update public.memberships set status = 'inactive'
where household_id = '52000000-0000-0000-0000-000000000001'
  and user_id = '51000000-0000-0000-0000-00000000000e';
set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-00000000000a', true);

select is(
  (public.add_task_assignee('60000000-0000-0000-0000-000000000033', public.tid('t_two'),
    '51000000-0000-0000-0000-00000000000e') #>> '{error,code}'),
  'VALIDATION', 'an inactive member cannot be added'
);
select is(
  (public.set_task_assignees('60000000-0000-0000-0000-000000000034', public.tid('t_two'),
    (select (public.get_task_v2(public.tid('t_two')) #>> '{data,version}')::bigint),
    array['51000000-0000-0000-0000-00000000000a','51000000-0000-0000-0000-00000000000e']::uuid[])
    #>> '{error,code}'),
  'VALIDATION', 'a replacement containing an inactive member is rejected'
);
select is(
  (public.get_task_v2(public.tid('t_two')) #>> '{data,assignee_ids}'),
  '["51000000-0000-0000-0000-00000000000a", "51000000-0000-0000-0000-00000000000b"]',
  'the rejected replacement changed nothing (atomic)'
);
select is(
  (public.create_task_v3('60000000-0000-0000-0000-000000000035', '53000000-0000-0000-0000-000000000001',
    'Rejected', array[null, '51000000-0000-0000-0000-00000000000a']::uuid[]) #>> '{error,code}'),
  'VALIDATION', 'a null element is rejected'
);
select is(
  (public.create_task_v3('60000000-0000-0000-0000-000000000036', '53000000-0000-0000-0000-000000000001',
    'Rejected', (select array_agg(gen_random_uuid()) from generate_series(1, 51))) #>> '{error,code}'),
  'VALIDATION', 'an implausibly large set is rejected'
);

-- A revoked member loses every assignment command and read ------------------

select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-00000000000e', true);
select is(
  (public.add_task_assignee('60000000-0000-0000-0000-000000000040', public.tid('t_two'),
    '51000000-0000-0000-0000-00000000000e') #>> '{error,code}'),
  'FORBIDDEN', 'a revoked member cannot add assignees'
);
select is(
  (public.remove_task_assignee('60000000-0000-0000-0000-000000000041', public.tid('t_two'),
    '51000000-0000-0000-0000-00000000000a') #>> '{error,code}'),
  'FORBIDDEN', 'a revoked member cannot remove assignees'
);
select is(
  (public.get_task_v2(public.tid('t_two')) #>> '{error,code}'),
  'NOT_FOUND', 'a revoked member cannot read the task'
);
select is(
  (public.add_task_assignee('60000000-0000-0000-0000-000000000014', public.tid('t_two'),
    '51000000-0000-0000-0000-00000000000e') #>> '{error,code}'),
  'FORBIDDEN', 'a revoked member cannot replay an earlier receipt either'
);

-- Another household cannot reach the task at all.
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-00000000000d', true);
select is(
  (public.add_task_assignee('60000000-0000-0000-0000-000000000042', public.tid('t_two'),
    '51000000-0000-0000-0000-00000000000d') #>> '{error,code}'),
  'NOT_FOUND', 'another household sees NOT_FOUND, not the task'
);
select is(
  (public.get_task_v2(public.tid('t_two')) #>> '{error,code}'),
  'NOT_FOUND', 'and cannot read it'
);
select is(
  (public.remove_task_assignee('60000000-0000-0000-0000-000000000043', public.tid('t_two'),
    '51000000-0000-0000-0000-00000000000a') #>> '{error,code}'),
  'NOT_FOUND', 'and cannot remove anyone from it'
);

-- No JWT subject: the commands answer UNAUTHENTICATED.
select set_config('request.jwt.claim.sub', '', true);
select is(
  (public.add_task_assignee('60000000-0000-0000-0000-000000000044', public.tid('t_two'),
    '51000000-0000-0000-0000-00000000000a') #>> '{error,code}'),
  'UNAUTHENTICATED', 'no identity is refused'
);
select throws_ok(
  $$ select * from public.task_assignees $$, '42501', null,
  'an authenticated client cannot select assignments directly'
);

set local role anon;
select throws_ok(
  $$ select public.add_task_assignee('60000000-0000-0000-0000-000000000045',
       gen_random_uuid(), gen_random_uuid()) $$,
  '42501', null, 'anon cannot call add_task_assignee'
);
select throws_ok(
  $$ select public.get_task_v2(gen_random_uuid()) $$,
  '42501', null, 'anon cannot read a task'
);

-- Idempotency, retries and canonical sets ----------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-00000000000a', true);

insert into fixture_state values ('t_idem', public.create_task_v3(
  '60000000-0000-0000-0000-000000000050', '53000000-0000-0000-0000-000000000001', 'Idempotent'
) #>> '{data,id}');
select public.set_task_assignees('60000000-0000-0000-0000-000000000051', public.tid('t_idem'), 1,
  array['51000000-0000-0000-0000-00000000000b','51000000-0000-0000-0000-00000000000a']::uuid[]);
select is(
  (public.set_task_assignees('60000000-0000-0000-0000-000000000051', public.tid('t_idem'), 1,
    array['51000000-0000-0000-0000-00000000000a','51000000-0000-0000-0000-00000000000b',
          '51000000-0000-0000-0000-00000000000a']::uuid[]) #>> '{ok}'),
  'true', 'a retry that re-orders or repeats ids is the same request'
);
select is(
  (select version::integer from public.tasks where id = public.tid('t_idem')), 2,
  'and it did not apply twice'
);
select is(
  (public.set_task_assignees('60000000-0000-0000-0000-000000000051', public.tid('t_idem'), 1,
    array['51000000-0000-0000-0000-00000000000a']::uuid[]) #>> '{error,code}'),
  'IDEMPOTENCY_MISMATCH', 'the same request ID with a different set is a mismatch'
);
select is(
  (public.add_task_assignee('60000000-0000-0000-0000-000000000051', public.tid('t_idem'),
    '51000000-0000-0000-0000-00000000000a') #>> '{error,code}'),
  'IDEMPOTENCY_MISMATCH', 'and so is the same ID used for a different command'
);
select is(
  (public.update_task_v3('60000000-0000-0000-0000-000000000051', public.tid('t_idem'), 2, 'x',
    '{}'::uuid[]) #>> '{error,code}'),
  'IDEMPOTENCY_MISMATCH', 'and for the editor command'
);
reset role;
select is(
  (select count(*)::integer from private.command_receipts
    where actor_user_id = '51000000-0000-0000-0000-00000000000a'
      and request_id = '60000000-0000-0000-0000-000000000051'),
  1, 'one receipt however many times it was sent'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-00000000000a', true);

-- Editor replacement conflicts ----------------------------------------------

insert into fixture_state values ('t_race', public.create_task_v3(
  '60000000-0000-0000-0000-000000000060', '53000000-0000-0000-0000-000000000001', 'Race'
) #>> '{data,id}');
-- Two editors both opened the task at version 1.
select is(
  (public.update_task_v3('60000000-0000-0000-0000-000000000061', public.tid('t_race'), 1, 'Race',
    array['51000000-0000-0000-0000-00000000000a']::uuid[]) #>> '{ok}'),
  'true', 'the first editor saves'
);
select is(
  (public.update_task_v3('60000000-0000-0000-0000-000000000062', public.tid('t_race'), 1, 'Race',
    array['51000000-0000-0000-0000-00000000000b']::uuid[]) #>> '{error,code}'),
  'CONFLICT', 'the second editor, working from the old version, is a conflict'
);
select is(
  (public.update_task_v3('60000000-0000-0000-0000-000000000063', public.tid('t_race'), 1, 'Race',
    array['51000000-0000-0000-0000-00000000000b']::uuid[]) #>> '{error,current_version}'),
  '2', 'the conflict reports the current version'
);
-- An add landing between an editor's load and save also conflicts the editor.
select public.add_task_assignee('60000000-0000-0000-0000-000000000064', public.tid('t_race'),
  '51000000-0000-0000-0000-00000000000c');
select is(
  (public.set_task_assignees('60000000-0000-0000-0000-000000000065', public.tid('t_race'), 2,
    '{}'::uuid[]) #>> '{error,code}'),
  'CONFLICT', 'clearing everyone from a stale view cannot erase the member who was just added'
);
select is(
  (public.get_task_v2(public.tid('t_race')) #>> '{data,assignee_ids}'),
  '["51000000-0000-0000-0000-00000000000a", "51000000-0000-0000-0000-00000000000c"]',
  'and the set is intact'
);

-- Legacy single-assignee clients -------------------------------------------

insert into fixture_state values ('t_multi', public.create_task_v3(
  '60000000-0000-0000-0000-000000000070', '53000000-0000-0000-0000-000000000001', 'Legacy target',
  array['51000000-0000-0000-0000-00000000000a','51000000-0000-0000-0000-00000000000b',
        '51000000-0000-0000-0000-00000000000c']::uuid[]
) #>> '{data,id}');

select is(
  (select assignee_id::text from public.tasks where id = public.tid('t_multi')),
  '51000000-0000-0000-0000-00000000000a',
  'the stored legacy projection is the lowest assignee id'
);
-- Reads, as each member's installed client sees them.
select is(
  (select i ->> 'assignee_id' from jsonb_array_elements(public.get_list_v2('53000000-0000-0000-0000-000000000001') #> '{data,tasks}') i
    where i ->> 'id' = public.tid('t_multi')::text),
  '51000000-0000-0000-0000-00000000000a', 'Ana''s client reads herself as the assignee'
);
select set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-00000000000c', true);
select is(
  (select i ->> 'assignee_id' from jsonb_array_elements(public.get_my_tasks_v2() #> '{data,items}') i
    where i ->> 'id' = public.tid('t_multi')::text),
  '51000000-0000-0000-0000-00000000000c', 'Cara''s client reads herself, so its Mine view still matches'
);
select is(
  (select i ->> 'assignee_id' from jsonb_array_elements(public.get_list('53000000-0000-0000-0000-000000000001') #> '{data,tasks}') i
    where i ->> 'id' = public.tid('t_multi')::text),
  '51000000-0000-0000-0000-00000000000c', 'the paged legacy list read agrees'
);
select is(
  (select count(*)::integer from jsonb_array_elements(public.get_my_tasks() #> '{data,items}') i
    where i ->> 'task_id' = public.tid('t_multi')::text),
  1, 'the paged legacy Mine read returns the task once'
);

-- Writes: the old editor sends back the single assignee it was shown.
select is(
  (public.update_task_v2('60000000-0000-0000-0000-000000000071', public.tid('t_multi'), 1, 'Legacy renamed',
    '51000000-0000-0000-0000-00000000000c', '2026-12-03T10:00:00Z', 'legacy note') #>> '{data,title}'),
  'Legacy renamed', 'an old editor saving unrelated edits succeeds'
);
select is(
  (public.get_task_v2(public.tid('t_multi')) #>> '{data,assignee_ids}'),
  '["51000000-0000-0000-0000-00000000000a", "51000000-0000-0000-0000-00000000000b", "51000000-0000-0000-0000-00000000000c"]',
  'and every assignee is still there'
);
select is(
  (public.update_task_v2('60000000-0000-0000-0000-000000000072', public.tid('t_multi'), 2, 'Legacy renamed',
    null, '2026-12-03T10:00:00Z', 'legacy note') #>> '{error,code}'),
  'CONFLICT', 'an old editor clearing the assignee of a multi-assignee task is refused'
);
select is(
  (public.update_task_v2('60000000-0000-0000-0000-000000000073', public.tid('t_multi'), 2, 'Legacy renamed',
    '51000000-0000-0000-0000-00000000000b', '2026-12-03T10:00:00Z', 'legacy note') #>> '{error,message_key}'),
  'error.task_multiple_assignees', 'so is one reassigning it, with its own message key'
);
select is(
  (public.update_task('60000000-0000-0000-0000-000000000074', public.tid('t_multi'), 2, 'Legacy v1',
    null, null) #>> '{error,code}'),
  'CONFLICT', 'the oldest update command is refused the same way'
);
select is(
  (select version::integer from public.tasks where id = public.tid('t_multi')), 2,
  'refusals do not consume a version'
);
select is(
  (public.update_task('60000000-0000-0000-0000-000000000075', public.tid('t_multi'), 2, 'Legacy v1',
    '51000000-0000-0000-0000-00000000000a', '2026-12-03T10:00:00Z') #>> '{ok}'),
  'true', 'the oldest update command may keep the primary assignee'
);
select is(
  (public.claim_task('60000000-0000-0000-0000-000000000076', public.tid('t_multi'), 3)
    #>> '{error,code}'),
  'ALREADY_ASSIGNED', 'the old claim command still reports an assigned task'
);
select is(
  (public.set_task_completed('60000000-0000-0000-0000-000000000077', public.tid('t_multi'), 3, true)
    #>> '{data,completed}'),
  'true', 'the old completion command works on a multi-assignee task'
);
select is(
  (public.set_task_state('60000000-0000-0000-0000-000000000078', public.tid('t_multi'), 4, 'open')
    #>> '{data,assignee_ids}'),
  '["51000000-0000-0000-0000-00000000000a", "51000000-0000-0000-0000-00000000000b", "51000000-0000-0000-0000-00000000000c"]',
  'and the old state command'
);
-- Single-assignee tasks keep their old semantics.
insert into fixture_state values ('t_legacy', public.create_task_v2(
  '60000000-0000-0000-0000-000000000079', '53000000-0000-0000-0000-000000000001', 'Legacy create',
  '51000000-0000-0000-0000-00000000000b', null, null) #>> '{data,id}');
select is(
  (public.get_task_v2(public.tid('t_legacy')) #>> '{data,assignee_ids}'),
  '["51000000-0000-0000-0000-00000000000b"]', 'an old create with one assignee stores a one-member set'
);
select is(
  (public.update_task_v2('60000000-0000-0000-0000-000000000080', public.tid('t_legacy'), 1, 'Legacy create',
    '51000000-0000-0000-0000-00000000000c', null, null) #>> '{data,assignee_ids}'),
  '["51000000-0000-0000-0000-00000000000c"]', 'an old editor can reassign a single-assignee task'
);
select is(
  (public.update_task_v2('60000000-0000-0000-0000-000000000081', public.tid('t_legacy'), 2, 'Legacy create',
    null, null, null) #>> '{data,assignee_ids}'),
  '[]', 'and clear it'
);
select is(
  (public.claim_task('60000000-0000-0000-0000-000000000082', public.tid('t_legacy'), 3)
    #>> '{data,assignee_ids}'),
  '["51000000-0000-0000-0000-00000000000c"]', 'the old claim still claims an unassigned task'
);
-- A direct read, as an installed client's task details use, shows the projection.
select is(
  (select assignee_id::text from public.tasks where id = public.tid('t_legacy')),
  '51000000-0000-0000-0000-00000000000c', 'a direct task read shows the projected assignee'
);

-- Templates carry no assignments --------------------------------------------

select is(
  (public.create_task_v3('60000000-0000-0000-0000-000000000090', '53000000-0000-0000-0000-000000000002',
    'Template task', array['51000000-0000-0000-0000-00000000000a']::uuid[]) #>> '{error,message_key}'),
  'error.template_task_runtime', 'a template task refuses assignees'
);
insert into fixture_state values ('t_tmpl', public.create_task_v3(
  '60000000-0000-0000-0000-000000000091', '53000000-0000-0000-0000-000000000002', 'Template task'
) #>> '{data,id}');
select is(
  (public.add_task_assignee('60000000-0000-0000-0000-000000000092', public.tid('t_tmpl'),
    '51000000-0000-0000-0000-00000000000a') #>> '{error,code}'),
  'NOT_FOUND', 'and so does add_task_assignee'
);
-- Saving and copying a list that has assigned tasks carries none of it over.
insert into fixture_state values ('saved', public.save_list_template(
  '60000000-0000-0000-0000-000000000093', '53000000-0000-0000-0000-000000000001') #>> '{data,list_id}');
select is(
  (select count(*)::integer from public.tasks t
    where t.list_id = public.tid('saved') and t.assignee_id is not null),
  0, 'a saved list template carries no assignee'
);
insert into fixture_state values ('copied', public.copy_template(
  '60000000-0000-0000-0000-000000000094', public.tid('saved')) #>> '{data,list_id}');
reset role;
select is(
  (select count(*)::integer from public.task_assignees ta
    join public.tasks t on t.id = ta.task_id
    where t.list_id in (public.tid('saved'), public.tid('copied'))),
  0, 'neither saved nor copied lists hold any assignment rows'
);

-- Database-enforced constraints, as the table owner -------------------------

select throws_ok(
  $$ insert into public.task_assignees (task_id, household_id, user_id)
     values (public.tid('t_two'), '52000000-0000-0000-0000-000000000001',
             '51000000-0000-0000-0000-00000000000e') $$,
  '23514', 'assignee must be an active household member',
  'a deactivated member cannot be assigned even by a privileged writer'
);
select throws_ok(
  $$ insert into public.task_assignees (task_id, household_id, user_id)
     values (public.tid('t_two'), '52000000-0000-0000-0000-000000000001',
             '51000000-0000-0000-0000-00000000000d') $$,
  '23514', 'assignee must be an active household member',
  'a member of another household cannot be assigned'
);
select throws_ok(
  $$ insert into public.task_assignees (task_id, household_id, user_id)
     values (public.tid('t_two'), '52000000-0000-0000-0000-000000000001',
             '51000000-0000-0000-0000-00000000000a') $$,
  '23505', null, 'the same member cannot be assigned twice'
);
select throws_ok(
  $$ insert into public.task_assignees (task_id, household_id, user_id)
     values (public.tid('t_two'), '52000000-0000-0000-0000-000000000002',
             '51000000-0000-0000-0000-00000000000d') $$,
  '23503', null, 'an assignment cannot carry a household different from its task'
);
select throws_ok(
  $$ insert into public.task_assignees (task_id, household_id, user_id)
     values (public.tid('t_tmpl'), '52000000-0000-0000-0000-000000000001',
             '51000000-0000-0000-0000-00000000000a') $$,
  '23514', 'template tasks cannot carry runtime state', 'a template task cannot be assigned'
);
select throws_ok(
  $$ update public.task_assignees set user_id = '51000000-0000-0000-0000-00000000000b'
     where task_id = public.tid('t_two') $$,
  '23514', null, 'assignments are never edited in place'
);
-- The legacy projection cannot drift: a writer that changes the set without
-- the column fails when the transaction would commit.
delete from public.task_assignees
where task_id = public.tid('t_idem') and user_id = '51000000-0000-0000-0000-00000000000a';
select throws_ok(
  $$ set constraints all immediate $$, '23514', null,
  'the projection constraint catches a set that changed without tasks.assignee_id'
);

select * from finish();
rollback;
