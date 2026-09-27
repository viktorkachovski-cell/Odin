begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

create temporary table workflow_fixture (key text primary key, value text not null);
grant all on workflow_fixture to authenticated;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '40000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
  'workflow-a@example.test', extensions.crypt('test', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
), (
  '40000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
  'workflow-b@example.test', extensions.crypt('test', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select is(public.update_profile(gen_random_uuid(), 'Workflow A', 'en', null) #>> '{ok}', 'true', 'member profile created');
select is(public.create_household(gen_random_uuid(), 'Workflow A home', 'en') #>> '{ok}', 'true', 'household created');
insert into workflow_fixture values ('household', public.get_my_household() #>> '{data,id}');
insert into workflow_fixture values ('list_a', public.create_list(gen_random_uuid(), 'First list', null) #>> '{data,id}');
insert into workflow_fixture values ('list_b', public.create_list(gen_random_uuid(), 'Second list', null) #>> '{data,id}');
select is((select sort_order::text from public.lists where id = (select value::uuid from workflow_fixture where key = 'list_a')), '0', 'first list starts at zero');
select is((select sort_order::text from public.lists where id = (select value::uuid from workflow_fixture where key = 'list_b')), '1', 'next list appends');

insert into workflow_fixture values ('task_a', public.create_task(gen_random_uuid(), (select value::uuid from workflow_fixture where key = 'list_a'), 'First task') #>> '{data,id}');
insert into workflow_fixture values ('task_b', public.create_task(gen_random_uuid(), (select value::uuid from workflow_fixture where key = 'list_a'), 'Second task') #>> '{data,id}');
select is(public.set_task_status(gen_random_uuid(), (select value::uuid from workflow_fixture where key = 'task_b'), 1, 'todo') #>> '{error,code}', 'VALIDATION', 'null assignee cannot be to-do');
select is(public.set_task_status(gen_random_uuid(), (select value::uuid from workflow_fixture where key = 'task_b'), 1, 'blocked') #>> '{data,blocked}', 'true', 'task can be blocked');
select is((select value ->> 'blocked' from jsonb_array_elements(public.get_unassigned() #> '{data,items}') as value where value ->> 'title' = 'Second task'), 'true', 'unassigned view includes blocked status');
select is(public.set_task_status(gen_random_uuid(), (select value::uuid from workflow_fixture where key = 'task_b'), 2, 'done') #>> '{data,completed}', 'true', 'task can be done');
select is(public.set_task_status(gen_random_uuid(), (select value::uuid from workflow_fixture where key = 'task_b'), 3, 'unassigned') #>> '{data,blocked}', 'false', 'restoring normal status clears blocked');
select is(public.move_task(gen_random_uuid(), (select value::uuid from workflow_fixture where key = 'task_b'), 4, 'up') #>> '{ok}', 'true', 'task move succeeds');
select is((select sort_order::text from public.tasks where id = (select value::uuid from workflow_fixture where key = 'task_b')), '0', 'moving up swaps task positions');
select is((select sort_order::text from public.tasks where id = (select value::uuid from workflow_fixture where key = 'task_a')), '1', 'adjacent task advances');
select is(public.move_task(gen_random_uuid(), (select value::uuid from workflow_fixture where key = 'task_b'), 4, 'down') #>> '{error,code}', 'CONFLICT', 'stale task order is rejected');
select is(public.move_list(gen_random_uuid(), (select value::uuid from workflow_fixture where key = 'list_b'), 1, 'up') #>> '{ok}', 'true', 'list move succeeds');
select is((select sort_order::text from public.lists where id = (select value::uuid from workflow_fixture where key = 'list_b')), '0', 'moving up swaps list positions');
select is((select sort_order::text from public.lists where id = (select value::uuid from workflow_fixture where key = 'list_a')), '1', 'adjacent list advances');
select is(public.get_home_v2() #>> '{data,items,0,title}', 'Second list', 'new home read uses shared order');

insert into workflow_fixture values ('dated_task', public.create_task(gen_random_uuid(), (select value::uuid from workflow_fixture where key = 'list_a'), 'Dated task', null, '2026-10-25T12:00:00Z') #>> '{data,id}');
select is(public.get_all_tasks('2026-10-25T00:00:00Z', '2026-10-26T00:00:00Z') #>> '{data,items,0,title}', 'Dated task', 'date filter includes a bounded deadline');
select is(jsonb_array_length(public.get_all_tasks('2026-10-26T00:00:00Z', '2026-10-27T00:00:00Z') #> '{data,items}')::text, '0', 'exclusive upper bound excludes earlier tasks');
select is(jsonb_array_length(public.get_all_tasks(null, null, true) #> '{data,items}')::text, '2', 'undated filter excludes dated tasks');
select is(public.get_all_tasks('2026-10-27T00:00:00Z', '2026-10-25T00:00:00Z') #>> '{error,code}', 'VALIDATION', 'reversed range rejected');
select is(public.get_all_tasks('2026-10-25T00:00:00Z', null, true) #>> '{error,code}', 'VALIDATION', 'undated cannot combine with bounds');
select is(public.get_all_tasks(p_cursor => 'invalid') #>> '{error,code}', 'VALIDATION', 'malformed cursor rejected');

reset role;
insert into public.profiles (user_id, display_name, locale) values ('40000000-0000-0000-0000-000000000002', 'Workflow B', 'en');
insert into public.households (id, name, seed_locale, created_by) values ('40000000-0000-0000-0000-000000000003', 'Other home', 'en', '40000000-0000-0000-0000-000000000002');
insert into public.memberships (household_id, user_id) values ('40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000002');
insert into public.lists (id, household_id, kind, title, created_by) values ('40000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000003', 'active', 'Other list', '40000000-0000-0000-0000-000000000002');
insert into public.tasks (household_id, list_id, title, sort_order) values ('40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000004', 'Other task', 0);
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select is((select count(*)::text from public.tasks where list_id = '40000000-0000-0000-0000-000000000004'), '0', 'other household tasks are hidden');
select is(public.get_all_tasks() #>> '{data,items,0,household_id}', (select value from workflow_fixture where key = 'household'), 'all-tasks read scoped to caller household');

select * from finish();
rollback;
