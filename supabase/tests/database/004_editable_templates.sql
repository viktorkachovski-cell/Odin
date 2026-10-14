begin;
create extension if not exists pgtap with schema extensions;
select plan(36);

-- Editable list templates (docs/features.md, owner request 2026-10-14): a
-- template's text and tasks are edited with the active-list commands, but its
-- tasks never carry an assignee, deadline, completion or blocked state.

create temporary table template_fixture (key text primary key, value text not null);
grant all on template_fixture to authenticated;
create function pg_temp.fx(p_key text) returns uuid language sql stable
as $$ select value::uuid from template_fixture where key = p_key $$;
create function pg_temp.list_version(p_key text) returns bigint language sql stable
as $$ select version from public.lists where id = pg_temp.fx(p_key) $$;
create function pg_temp.task_version(p_key text) returns bigint language sql stable
as $$ select version from public.tasks where id = pg_temp.fx(p_key) $$;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '50000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
  'template-a@example.test', extensions.crypt('test', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
), (
  '50000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
  'template-b@example.test', extensions.crypt('test', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

-- Member B owns another household with its own template.
set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000002', true);
select is(public.update_profile(gen_random_uuid(), 'Template B', 'en', null) #>> '{ok}', 'true', 'second member profile created');
select is(public.create_household(gen_random_uuid(), 'Template B home', 'en') #>> '{ok}', 'true', 'second household created');
insert into template_fixture values ('b_list', public.create_list(gen_random_uuid(), 'B list', null) #>> '{data,id}');
select public.create_task(gen_random_uuid(), pg_temp.fx('b_list'), 'B task');
insert into template_fixture values ('b_template', public.save_list_template(gen_random_uuid(), pg_temp.fx('b_list')) #>> '{data,list_id}');
insert into template_fixture values ('b_template_task', (select id::text from public.tasks where list_id = pg_temp.fx('b_template')));

-- Member A builds a template from a list.
select set_config('request.jwt.claim.sub', '50000000-0000-0000-0000-000000000001', true);
select is(public.update_profile(gen_random_uuid(), 'Template A', 'en', null) #>> '{ok}', 'true', 'member profile created');
select is(public.create_household(gen_random_uuid(), 'Template A home', 'en') #>> '{ok}', 'true', 'household created');
insert into template_fixture values ('source', public.create_list(gen_random_uuid(), 'Weekend', null) #>> '{data,id}');
select public.create_task(gen_random_uuid(), pg_temp.fx('source'), 'Pack bags');
insert into template_fixture values ('template', public.save_list_template(gen_random_uuid(), pg_temp.fx('source')) #>> '{data,list_id}');
insert into template_fixture values ('first_task', (select id::text from public.tasks where list_id = pg_temp.fx('template')));

-- List text.
select is(public.update_list_v2(gen_random_uuid(), pg_temp.fx('template'), 1, 'Weekend away', 'Two nights', 'Check the forecast') #>> '{data,title}', 'Weekend away', 'a template can be renamed');
select is((select notes from public.lists where id = pg_temp.fx('template')), 'Check the forecast', 'a template note can be edited');
select is(pg_temp.list_version('template'), 2::bigint, 'editing a template advances its version');
select is((select kind from public.lists where id = pg_temp.fx('template')), 'template', 'editing keeps it a template');
select is(public.update_list(gen_random_uuid(), pg_temp.fx('template'), 2, 'Weekend trip', null) #>> '{ok}', 'true', 'the legacy list update edits a template too');
select is((select notes from public.lists where id = pg_temp.fx('template')), 'Check the forecast', 'the legacy list update preserves the template note');
select is(public.update_list_v2(gen_random_uuid(), pg_temp.fx('template'), 2, 'Stale', null, null) #>> '{error,code}', 'CONFLICT', 'a stale template edit conflicts');

-- Adding tasks.
insert into template_fixture values ('second_task', public.create_task_v2(gen_random_uuid(), pg_temp.fx('template'), 'Water plants', null, null, 'Ask a neighbour') #>> '{data,id}');
select is((select sort_order::text from public.tasks where id = pg_temp.fx('second_task')), '1', 'a task added to a template is appended');
select is((select notes from public.tasks where id = pg_temp.fx('second_task')), 'Ask a neighbour', 'a template task keeps its note');
select is(public.create_task(gen_random_uuid(), pg_temp.fx('template'), 'Lock up') #>> '{ok}', 'true', 'the legacy create adds to a template too');
select is(public.create_task_v2(gen_random_uuid(), pg_temp.fx('template'), 'Mine', '50000000-0000-0000-0000-000000000001', null, null) #>> '{error,message_key}', 'error.template_task_runtime', 'a template task cannot be created with an assignee');
select is(public.create_task_v2(gen_random_uuid(), pg_temp.fx('template'), 'Dated', null, '2026-11-01T09:00:00Z', null) #>> '{error,code}', 'VALIDATION', 'a template task cannot be created with a deadline');
select is(public.create_task(gen_random_uuid(), pg_temp.fx('template'), 'Dated', null, '2026-11-01T09:00:00Z') #>> '{error,code}', 'VALIDATION', 'the legacy create refuses a deadline on a template');
select is((select count(*)::text from public.tasks where list_id = pg_temp.fx('template')), '3', 'refused creates add nothing');

-- Editing tasks.
select is(public.update_task_v2(gen_random_uuid(), pg_temp.fx('first_task'), 1, 'Pack light', null, null, 'One bag each') #>> '{data,title}', 'Pack light', 'a template task can be renamed');
select is((select notes from public.tasks where id = pg_temp.fx('first_task')), 'One bag each', 'a template task note can be edited');
select is(public.update_task_v2(gen_random_uuid(), pg_temp.fx('first_task'), 2, 'Pack light', '50000000-0000-0000-0000-000000000001', null, null) #>> '{error,message_key}', 'error.template_task_runtime', 'a template task cannot be assigned');
select is(public.update_task(gen_random_uuid(), pg_temp.fx('first_task'), 2, 'Pack light', null, '2026-11-01T09:00:00Z') #>> '{error,code}', 'VALIDATION', 'the legacy update refuses a deadline on a template task');
select is(pg_temp.task_version('first_task'), 2::bigint, 'refused edits leave the version alone');
select is(public.move_task(gen_random_uuid(), pg_temp.fx('second_task'), 1, 'up') #>> '{ok}', 'true', 'template tasks can still be reordered');

-- Runtime commands stay active-list only.
select is(public.claim_task(gen_random_uuid(), pg_temp.fx('first_task'), 2) #>> '{error,code}', 'NOT_FOUND', 'a template task cannot be claimed');
select is(public.set_task_state(gen_random_uuid(), pg_temp.fx('first_task'), 2, 'done') #>> '{error,code}', 'NOT_FOUND', 'a template task cannot be done');
select is(public.set_task_completed(gen_random_uuid(), pg_temp.fx('first_task'), 2, true) #>> '{error,code}', 'NOT_FOUND', 'the legacy completion refuses a template task');

-- Deleting a task.
select is(public.delete_task(gen_random_uuid(), pg_temp.fx('second_task'), 1) #>> '{error,code}', 'CONFLICT', 'deleting a stale template task conflicts');
select is(public.delete_task(gen_random_uuid(), pg_temp.fx('second_task'), pg_temp.task_version('second_task')) #>> '{ok}', 'true', 'a template task can be deleted');

-- The edited template is what gets copied, and the copy is an ordinary list.
insert into template_fixture values ('copy', public.copy_template(gen_random_uuid(), pg_temp.fx('template')) #>> '{data,list_id}');
select is((select string_agg(title, ',' order by sort_order) from public.tasks where list_id = pg_temp.fx('copy')), 'Pack light,Lock up', 'copying uses the edited template');
select is(public.get_all_tasks(null, null, false, false) #> '{data,items}' @> jsonb_build_array(jsonb_build_object('id', pg_temp.fx('first_task'))), false, 'template tasks stay out of the household task read');

-- Another household's template is not reachable.
select is(public.update_list_v2(gen_random_uuid(), pg_temp.fx('b_template'), 1, 'Mine now', null, null) #>> '{error,code}', 'NOT_FOUND', 'another household template cannot be edited');
select is(public.create_task_v2(gen_random_uuid(), pg_temp.fx('b_template'), 'Intruder', null, null, null) #>> '{error,code}', 'NOT_FOUND', 'tasks cannot be added to another household template');
select is(public.delete_task(gen_random_uuid(), pg_temp.fx('b_template_task'), 1) #>> '{error,code}', 'NOT_FOUND', 'another household template task cannot be deleted');

-- An archived template is no longer editable.
select is(public.delete_list(gen_random_uuid(), pg_temp.fx('template'), pg_temp.list_version('template')) #>> '{ok}', 'true', 'template archived');
select is(public.update_list_v2(gen_random_uuid(), pg_temp.fx('template'), pg_temp.list_version('template'), 'Revived', null, null) #>> '{error,code}', 'NOT_FOUND', 'an archived template cannot be edited');

select * from finish();
rollback;
