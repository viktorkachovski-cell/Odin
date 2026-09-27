begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

create temporary table workflow_fixture (key text primary key, value text not null);
grant all on workflow_fixture to authenticated;
create function pg_temp.fx(p_key text) returns uuid language sql stable
as $$ select value::uuid from workflow_fixture where key = p_key $$;
create function pg_temp.task_order(p_key text) returns text language sql stable
as $$ select sort_order::text from public.tasks where id = pg_temp.fx(p_key) $$;

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
select is((select sort_order::text from public.lists where id = pg_temp.fx('list_a')), '0', 'first list starts at zero');
select is((select sort_order::text from public.lists where id = pg_temp.fx('list_b')), '1', 'next list appends');

insert into workflow_fixture values ('task_a', public.create_task(gen_random_uuid(), pg_temp.fx('list_a'), 'First task') #>> '{data,id}');
insert into workflow_fixture values ('task_b', public.create_task(gen_random_uuid(), pg_temp.fx('list_a'), 'Second task') #>> '{data,id}');

-- Task state: open, blocked or done. Unassigned/To-do are projections, not inputs.
select is(public.set_task_state(gen_random_uuid(), pg_temp.fx('task_b'), 1, 'todo') #>> '{error,code}', 'VALIDATION', 'display labels are not states');
select is(public.set_task_state(gen_random_uuid(), pg_temp.fx('task_b'), 1, 'blocked') #>> '{data,blocked}', 'true', 'task can be blocked');
select is((select value ->> 'blocked' from jsonb_array_elements(public.get_unassigned_v2() #> '{data,items}') as value where value ->> 'title' = 'Second task'), 'true', 'unassigned view includes blocked state');
select is(public.set_task_state(gen_random_uuid(), pg_temp.fx('task_b'), 2, 'done') #>> '{data,completed}', 'true', 'task can be done');
select is(public.set_task_state(gen_random_uuid(), pg_temp.fx('task_b'), 3, 'open') #>> '{data,blocked}', 'false', 'reopening clears blocked');
select is((select completed::text from public.tasks where id = pg_temp.fx('task_b')), 'false', 'reopening clears done');
select is(public.set_task_state(gen_random_uuid(), pg_temp.fx('task_b'), 4, 'blocked') #>> '{data,version}', '5', 'blocking again advances the version once');
select is(public.set_task_completed(gen_random_uuid(), pg_temp.fx('task_b'), 5, false) #>> '{data,blocked}', 'false', 'legacy completion command clears blocked');

-- Moves: adjacent swaps inside a completion group, version checked.
select is(public.move_task(gen_random_uuid(), pg_temp.fx('task_b'), 6, 'up') #>> '{ok}', 'true', 'task move succeeds');
select is(pg_temp.task_order('task_b'), '0', 'moving up swaps task positions');
select is(pg_temp.task_order('task_a'), '1', 'adjacent task advances');
select is(public.move_task(gen_random_uuid(), pg_temp.fx('task_b'), 6, 'down') #>> '{error,code}', 'CONFLICT', 'stale task order is rejected');
select is(public.move_task(gen_random_uuid(), pg_temp.fx('task_b'), 7, 'up') #>> '{ok}', 'true', 'moving past the top is a no-op');
select is(pg_temp.task_order('task_b'), '0', 'boundary move leaves the order alone');

insert into workflow_fixture values ('dated_task', public.create_task(gen_random_uuid(), pg_temp.fx('list_a'), 'Dated task', null, '2026-10-25T12:00:00Z') #>> '{data,id}');
select is(public.set_task_completed(gen_random_uuid(), pg_temp.fx('task_a'), 2, true) #>> '{ok}', 'true', 'task completed');
select is(public.move_task(gen_random_uuid(), pg_temp.fx('dated_task'), 1, 'up') #>> '{ok}', 'true', 'move skips over the completed group');
select is(pg_temp.task_order('dated_task') || ',' || pg_temp.task_order('task_b') || ',' || pg_temp.task_order('task_a'), '0,2,1', 'only incomplete neighbours swap');

select is(public.move_list(gen_random_uuid(), pg_temp.fx('list_b'), 1, 'up') #>> '{ok}', 'true', 'list move succeeds');
select is((select sort_order::text from public.lists where id = pg_temp.fx('list_b')), '0', 'moving up swaps list positions');
select is((select sort_order::text from public.lists where id = pg_temp.fx('list_a')), '1', 'adjacent list advances');

-- Template tasks can be reordered but carry no runtime state.
insert into workflow_fixture values ('template', public.save_list_template(gen_random_uuid(), pg_temp.fx('list_a')) #>> '{data,list_id}');
insert into workflow_fixture values ('template_task', (select id::text from public.tasks where list_id = pg_temp.fx('template') and title = 'Dated task'));
select is(public.move_task(gen_random_uuid(), pg_temp.fx('template_task'), 1, 'down') #>> '{ok}', 'true', 'template task moves');
select is(public.set_task_state(gen_random_uuid(), pg_temp.fx('template_task'), 2, 'blocked') #>> '{error,code}', 'NOT_FOUND', 'template tasks cannot be blocked');

-- Snapshot reads.
select is(public.get_home_v2() #>> '{data,items,0,kind}', 'template', 'home lists templates first');
select is(public.get_home_v2() #>> '{data,items,1,title}', 'Second list', 'home uses shared list order');
select is(public.get_home_v2() -> 'data' ? 'next_cursor', false, 'home snapshot has no cursor');
select is(public.get_list_v2(pg_temp.fx('list_a')) #>> '{data,tasks,2,title}', 'First task', 'list snapshot puts completed tasks last');
select is(public.get_list_v2(pg_temp.fx('list_a')) #>> '{data,completed_tasks}', '1', 'list counts cover the whole list');
select is(public.claim_task(gen_random_uuid(), pg_temp.fx('dated_task'), 2) #>> '{ok}', 'true', 'task claimed');
select is(public.get_my_tasks_v2() #>> '{data,items,0,list_title}', 'First list', 'my tasks carries full rows with list titles');
select is(jsonb_array_length(public.get_unassigned_v2() #> '{data,items}')::text, '1', 'unassigned excludes claimed and completed tasks');

select is(public.get_all_tasks('2026-10-25T00:00:00Z', '2026-10-26T00:00:00Z') #>> '{data,items,0,title}', 'Dated task', 'date filter includes a bounded deadline');
select is(jsonb_array_length(public.get_all_tasks('2026-10-26T00:00:00Z', '2026-10-27T00:00:00Z') #> '{data,items}')::text, '0', 'exclusive upper bound excludes earlier tasks');
select is(jsonb_array_length(public.get_all_tasks(null, null, true) #> '{data,items}')::text, '2', 'undated filter excludes dated tasks');
select is(public.get_all_tasks('2026-10-27T00:00:00Z', '2026-10-25T00:00:00Z') #>> '{error,code}', 'VALIDATION', 'reversed range rejected');
select is(public.get_all_tasks('2026-10-25T00:00:00Z', null, true) #>> '{error,code}', 'VALIDATION', 'undated cannot combine with bounds');

-- A collection past the ceiling fails instead of being truncated.
reset role;
insert into public.tasks (household_id, list_id, title, sort_order)
select pg_temp.fx('household'), pg_temp.fx('list_b'), 'Bulk ' || n, n
from generate_series(0, private.collection_limit()) as n;
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select is(public.get_list_v2(pg_temp.fx('list_b')) #>> '{error,code}', 'TOO_LARGE', 'oversized list is refused, not truncated');
select is(public.get_all_tasks() #>> '{error,code}', 'TOO_LARGE', 'oversized task collection is refused, not truncated');

reset role;
insert into public.profiles (user_id, display_name, locale) values ('40000000-0000-0000-0000-000000000002', 'Workflow B', 'en');
insert into public.households (id, name, seed_locale, created_by) values ('40000000-0000-0000-0000-000000000003', 'Other home', 'en', '40000000-0000-0000-0000-000000000002');
insert into public.memberships (household_id, user_id) values ('40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000002');
insert into public.lists (id, household_id, kind, title, created_by) values ('40000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000003', 'active', 'Other list', '40000000-0000-0000-0000-000000000002');
insert into public.tasks (household_id, list_id, title, sort_order) values ('40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000004', 'Other task', 0);
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', true);
select is((select count(*)::text from public.tasks where list_id = '40000000-0000-0000-0000-000000000004'), '0', 'other household tasks are hidden');
select is(public.get_list_v2('40000000-0000-0000-0000-000000000004') #>> '{error,code}', 'NOT_FOUND', 'list snapshot scoped to caller household');

select * from finish();
rollback;
