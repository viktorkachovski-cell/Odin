begin;
create extension if not exists pgtap with schema extensions;
select plan(59);

-- Projects (owner request 2026-11-09): a named group of a household's active
-- lists. Any member manages them; deleting one ungroups its lists; a list
-- template is never in a project; reordering stays inside the group.

create temporary table project_fixture (key text primary key, value text not null);
grant all on project_fixture to authenticated, anon;
create function pg_temp.fx(p_key text) returns uuid language sql stable
as $$ select value::uuid from project_fixture where key = p_key $$;
create function pg_temp.list_version(p_key text) returns bigint language sql stable
as $$ select version from public.lists where id = pg_temp.fx(p_key) $$;
create function pg_temp.project_version(p_key text) returns bigint language sql stable
as $$ select version from public.projects where id = pg_temp.fx(p_key) $$;
create function pg_temp.list_project(p_key text) returns uuid language sql stable
as $$ select project_id from public.lists where id = pg_temp.fx(p_key) $$;
create function pg_temp.list_order(p_key text) returns integer language sql stable
as $$ select sort_order from public.lists where id = pg_temp.fx(p_key) $$;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '60000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
  'project-a@example.test', extensions.crypt('test', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
), (
  '60000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
  'project-b@example.test', extensions.crypt('test', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
), (
  '60000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated',
  'project-c@example.test', extensions.crypt('test', extensions.gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

set local role authenticated;

-- Member B owns another household with its own project and list.
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000002', true);
select public.update_profile(gen_random_uuid(), 'Project B', 'en', null);
select public.create_household(gen_random_uuid(), 'Project B home', 'en');
insert into project_fixture values ('b_project', public.create_project(gen_random_uuid(), 'B project') #>> '{data,id}');
insert into project_fixture values ('b_list', public.create_list_v2(gen_random_uuid(), 'B list', null, null) #>> '{data,id}');

-- Member C has no household.
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000003', true);
select is(public.create_project(gen_random_uuid(), 'No home') #>> '{error,code}', 'FORBIDDEN', 'a member without a household cannot create a project');
select is(public.get_projects() #>> '{error,code}', 'NOT_FOUND', 'a member without a household reads no projects');

-- Member A.
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);
select public.update_profile(gen_random_uuid(), 'Project A', 'en', null);
select public.create_household(gen_random_uuid(), 'Project A home', 'en');

-- Creating.
insert into project_fixture values ('zeta', public.create_project('61000000-0000-0000-0000-000000000001', '  Zeta  ') #>> '{data,id}');
select is((select name from public.projects where id = pg_temp.fx('zeta')), 'Zeta', 'a project name is trimmed');
select is(pg_temp.project_version('zeta'), 1::bigint, 'a new project starts at version 1');
select is(public.create_project('61000000-0000-0000-0000-000000000001', 'Zeta') #>> '{data,id}', pg_temp.fx('zeta')::text, 'a retried create returns the original project');
select is(public.create_project('61000000-0000-0000-0000-000000000001', 'Different') #>> '{error,code}', 'IDEMPOTENCY_MISMATCH', 'the same request id with another name is rejected');
select is((select count(*)::integer from public.projects where household_id = (select household_id from public.projects where id = pg_temp.fx('zeta'))), 1, 'a retry creates one project');
select is(public.create_project(gen_random_uuid(), '   ') #>> '{error,code}', 'VALIDATION', 'a blank name is refused');
select is(public.create_project(gen_random_uuid(), repeat('x', 161)) #>> '{error,code}', 'VALIDATION', 'a name over 160 characters is refused');
select is(public.create_project(gen_random_uuid(), repeat('x', 160)) #>> '{ok}', 'true', 'a 160 character name is accepted');
insert into project_fixture values ('alpha', public.create_project(gen_random_uuid(), 'alpha') #>> '{data,id}');

-- Renaming.
select is(public.update_project(gen_random_uuid(), pg_temp.fx('alpha'), 1, 'Alpha') #>> '{data,name}', 'Alpha', 'a project can be renamed');
select is(pg_temp.project_version('alpha'), 2::bigint, 'renaming advances the version');
select is(public.update_project(gen_random_uuid(), pg_temp.fx('alpha'), 1, 'Stale') #>> '{error,code}', 'CONFLICT', 'a stale rename conflicts');
select is(public.update_project(gen_random_uuid(), pg_temp.fx('alpha'), 1, 'Stale') #>> '{error,current_version}', '2', 'the conflict names the current version');
select is(public.update_project(gen_random_uuid(), pg_temp.fx('b_project'), 1, 'Hijack') #>> '{error,code}', 'NOT_FOUND', 'another household project cannot be renamed');

-- Lists: created in a project, moved in and out.
insert into project_fixture values ('in_alpha', public.create_list_v3(gen_random_uuid(), 'First', null, 'note', pg_temp.fx('alpha')) #>> '{data,id}');
select is(pg_temp.list_project('in_alpha'), pg_temp.fx('alpha'), 'create_list_v3 creates the list in the project');
select is((select kind from public.lists where id = pg_temp.fx('in_alpha')), 'active', 'the list is an active list');
insert into project_fixture values ('ungrouped', public.create_list_v3(gen_random_uuid(), 'No project', null, null, null) #>> '{data,id}');
select is(pg_temp.list_project('ungrouped'), null, 'create_list_v3 without a project creates an ungrouped list');
select is(public.create_list_v3(gen_random_uuid(), 'Lost', null, null, pg_temp.fx('b_project')) #>> '{error,code}', 'NOT_FOUND', 'a list cannot be created in another household project');
select is(public.create_list_v3(gen_random_uuid(), 'Lost', null, null, gen_random_uuid()) #>> '{error,code}', 'NOT_FOUND', 'a list cannot be created in an unknown project');
select is(public.create_list_v2(gen_random_uuid(), 'Legacy', null, null) #>> '{data,project_id}', null, 'the installed create_list_v2 makes an ungrouped list');

insert into project_fixture values ('loose', public.create_list_v2(gen_random_uuid(), 'Loose', null, null) #>> '{data,id}');
insert into project_fixture values ('second', public.create_list_v3(gen_random_uuid(), 'Second', null, null, pg_temp.fx('alpha')) #>> '{data,id}');
select is(public.set_list_project(gen_random_uuid(), pg_temp.fx('loose'), 1, pg_temp.fx('alpha')) #>> '{data,project_id}', pg_temp.fx('alpha')::text, 'a list moves into a project');
select is(pg_temp.list_version('loose'), 2::bigint, 'moving a list advances its version');
select is(public.set_list_project(gen_random_uuid(), pg_temp.fx('loose'), 2, pg_temp.fx('alpha')) #>> '{ok}', 'true', 'moving into the project it is already in succeeds');
select is(pg_temp.list_version('loose'), 2::bigint, 'an unchanged project keeps the version');
select is(public.set_list_project(gen_random_uuid(), pg_temp.fx('loose'), 1, null) #>> '{error,code}', 'CONFLICT', 'a stale move conflicts');
select is(public.set_list_project(gen_random_uuid(), pg_temp.fx('loose'), 2, pg_temp.fx('b_project')) #>> '{error,code}', 'NOT_FOUND', 'a list cannot move into another household project');
select is(public.set_list_project(gen_random_uuid(), pg_temp.fx('b_list'), 1, pg_temp.fx('alpha')) #>> '{error,code}', 'NOT_FOUND', 'another household list cannot be moved');
select is(public.set_list_project(gen_random_uuid(), pg_temp.fx('loose'), 2, null) #>> '{data,project_id}', null, 'a list moves out of its project');
select is(pg_temp.list_project('loose'), null, 'the list is ungrouped again');
select is(public.set_list_project(gen_random_uuid(), pg_temp.fx('loose'), 3, pg_temp.fx('alpha')) #>> '{ok}', 'true', 'the list moves back in');

-- Templates are never grouped.
insert into project_fixture values ('template', public.save_list_template(gen_random_uuid(), pg_temp.fx('in_alpha')) #>> '{data,list_id}');
select is(pg_temp.list_project('template'), null, 'a template saved from a grouped list is ungrouped');
select is(public.set_list_project(gen_random_uuid(), pg_temp.fx('template'), 1, pg_temp.fx('alpha')) #>> '{error,code}', 'NOT_FOUND', 'a template cannot be put in a project');
insert into project_fixture values ('copy', public.copy_template(gen_random_uuid(), pg_temp.fx('template')) #>> '{data,list_id}');
select is(pg_temp.list_project('copy'), null, 'a list copied from a template is ungrouped');

-- Reordering stays inside the group: ungrouped lists sit between the two.
select ok(pg_temp.list_order('in_alpha') < pg_temp.list_order('ungrouped') and pg_temp.list_order('ungrouped') < pg_temp.list_order('loose') and pg_temp.list_order('loose') < pg_temp.list_order('second'), 'the fixture interleaves an ungrouped list between grouped ones');
insert into project_fixture values ('first_order', pg_temp.list_order('in_alpha')::text), ('ungrouped_order', pg_temp.list_order('ungrouped')::text);
select is(public.move_list(gen_random_uuid(), pg_temp.fx('loose'), pg_temp.list_version('loose'), 'up') #>> '{ok}', 'true', 'a grouped list moves up');
select is(pg_temp.list_order('loose'), (select value::integer from project_fixture where key = 'first_order'), 'it swaps with the previous list of its own project, skipping the ungrouped lists between');
select is(pg_temp.list_order('ungrouped'), (select value::integer from project_fixture where key = 'ungrouped_order'), 'the ungrouped list keeps its position');

-- Reads.
select is((select jsonb_array_length(public.get_projects() #> '{data,items}')), 3, 'get_projects returns the three projects');
select is(public.get_projects() #>> '{data,items,0,name}', 'Alpha', 'projects are alphabetical regardless of case');
select is(public.get_projects() #>> '{data,items,0,list_count}', '3', 'a project counts its open active lists');
select is(public.get_projects() #>> '{data,items,2,name}', 'Zeta', 'the last project sorts last');
select ok(not exists (select 1 from jsonb_array_elements(public.get_projects() #> '{data,items}') item where item ->> 'name' = 'B project'), 'another household project is never listed');
select is((select item ->> 'project_id' from jsonb_array_elements(public.get_home_v2() #> '{data,items}') item where item ->> 'id' = pg_temp.fx('in_alpha')::text), pg_temp.fx('alpha')::text, 'the household summary names each list project');
select is(public.get_list_v2(pg_temp.fx('in_alpha')) #>> '{data,list,project_id}', pg_temp.fx('alpha')::text, 'list detail names the project');

-- Archiving a list removes it from the project count but keeps the link.
select public.delete_list(gen_random_uuid(), pg_temp.fx('second'), pg_temp.list_version('second'));
select is(public.get_projects() #>> '{data,items,0,list_count}', '2', 'an archived list leaves the project count');

-- Deleting ungroups, never deletes.
select is(public.delete_project(gen_random_uuid(), pg_temp.fx('alpha'), 1) #>> '{error,code}', 'CONFLICT', 'a stale delete conflicts');
select is(public.delete_project(gen_random_uuid(), pg_temp.fx('b_project'), 1) #>> '{error,code}', 'NOT_FOUND', 'another household project cannot be deleted');
insert into project_fixture values ('version_before', pg_temp.list_version('in_alpha')::text);
select is(public.delete_project(gen_random_uuid(), pg_temp.fx('alpha'), pg_temp.project_version('alpha')) #>> '{ok}', 'true', 'a project is deleted');
select is((select count(*)::integer from public.projects where id = pg_temp.fx('alpha')), 0, 'the project is gone');
select ok(pg_temp.list_project('in_alpha') is null and pg_temp.list_project('loose') is null and pg_temp.list_project('second') is null, 'its open and archived lists are ungrouped');
select is((select count(*)::integer from public.lists where id in (pg_temp.fx('in_alpha'), pg_temp.fx('loose'), pg_temp.fx('second'))), 3, 'no list was deleted');
select is(pg_temp.list_version('in_alpha'), (select value::bigint + 1 from project_fixture where key = 'version_before'), 'ungrouping advances each list version once');

-- Other members and roles.
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000002', true);
select is((select count(*)::integer from public.projects), 1, 'a member reads only their own household projects');
select is(public.get_projects() #>> '{data,items,0,name}', 'B project', 'and sees only their own in get_projects');

select throws_ok($$insert into public.projects (household_id, name, created_by) values (gen_random_uuid(), 'x', gen_random_uuid())$$, '42501', null, 'a client cannot insert a project directly');
select throws_ok($$update public.lists set project_id = null$$, '42501', null, 'a client cannot change a list project directly');

set local role anon;
select throws_ok($$select public.create_project(gen_random_uuid(), 'Anon')$$, '42501', null, 'anonymous callers cannot create projects');

reset role;
select throws_ok($$insert into public.lists (household_id, kind, title, created_by, project_id)
  select household_id, 'template', 'Grouped template', created_by, id from public.projects limit 1$$, '23514', null, 'the database refuses a template inside a project');

select * from finish();
rollback;
