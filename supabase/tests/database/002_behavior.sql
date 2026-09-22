begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

create temporary table fixture_state (
  key text primary key,
  value text not null
);
grant all on fixture_state to authenticated;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'a@example.test', extensions.crypt('test', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'b@example.test', extensions.crypt('test', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'c@example.test', extensions.crypt('test', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select is(public.update_profile(
  '10000000-0000-0000-0000-000000000001', 'Alice', 'en', null
) #>> '{ok}', 'true', 'Alice creates a profile');
select is(public.create_household(
  '10000000-0000-0000-0000-000000000002', 'Home A', 'en'
) #>> '{ok}', 'true', 'Alice creates household A');
insert into fixture_state values (
  'household_a', public.get_my_household() #>> '{data,id}'
);
select is(public.create_household(
  '10000000-0000-0000-0000-000000000003', 'Second Home', 'en'
) #>> '{error,code}', 'ALREADY_IN_HOUSEHOLD', 'one active household is enforced');

select is(public.update_profile(
  '10000000-0000-0000-0000-000000000004', '   ', 'en', null
) #>> '{error,code}', 'VALIDATION', 'blank display names are rejected');

select is(public.create_list(
  '10000000-0000-0000-0000-000000000005', 'Shopping', null
) #>> '{ok}', 'true', 'active list can be created');
insert into fixture_state values (
  'list_a', public.create_list(
    '10000000-0000-0000-0000-000000000006', 'Weekend', 'Shared work'
  ) #>> '{data,id}'
);
select is(
  public.create_list('10000000-0000-0000-0000-000000000006', 'Weekend', 'Shared work') #>> '{data,id}',
  (select value from fixture_state where key = 'list_a'),
  'repeated create request returns the original list'
);
select is(public.create_list(
  '10000000-0000-0000-0000-000000000006', 'Changed', null
) #>> '{error,code}', 'IDEMPOTENCY_MISMATCH', 'request ID cannot be reused with changed payload');

select is(public.create_task(
  '10000000-0000-0000-0000-000000000007',
  (select value::uuid from fixture_state where key = 'list_a'),
  'Pack', null, '2026-09-20T10:00:00Z'
) #>> '{ok}', 'true', 'task can be created');
insert into fixture_state values (
  'task_a', public.create_task(
    '10000000-0000-0000-0000-000000000008',
    (select value::uuid from fixture_state where key = 'list_a'),
    'Clean', null, null
  ) #>> '{data,id}'
);
select is(public.get_list(
  (select value::uuid from fixture_state where key = 'list_a')
) #>> '{data,progress_percent}', '0', 'new list progress is zero');

select throws_ok(
  $$insert into public.tasks (household_id, list_id, title, sort_order)
    values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Bypass', 0)$$,
  '42501', null, 'authenticated clients cannot bypass task RPCs'
);

reset role;
insert into public.lists (id, household_id, kind, title, seed_key, created_by)
values (
  '20000000-0000-0000-0000-000000000001',
  (select value::uuid from fixture_state where key = 'household_a'),
  'template', 'Trip', 'trip-test', '00000000-0000-0000-0000-000000000001'
);
insert into public.tasks (household_id, list_id, title, sort_order)
values
  ((select value::uuid from fixture_state where key = 'household_a'), '20000000-0000-0000-0000-000000000001', 'Tickets', 0),
  ((select value::uuid from fixture_state where key = 'household_a'), '20000000-0000-0000-0000-000000000001', 'Bags', 1);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
insert into fixture_state values (
  'copied_list', public.copy_template(
    '10000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000001'
  ) #>> '{data,list_id}'
);
select is((select count(*)::text from public.tasks where list_id = (
  select value::uuid from fixture_state where key = 'copied_list'
)), '2', 'template copy preserves all tasks');
select is((select count(*)::text from public.tasks where list_id = (
  select value::uuid from fixture_state where key = 'copied_list'
) and (completed or assignee_id is not null or due_at is not null)), '0', 'copied tasks reset runtime fields');
select is(public.copy_template(
  '10000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000001'
) #>> '{data,list_id}', (select value from fixture_state where key = 'copied_list'), 'copy is idempotent');

-- List notes and list templates (docs/23-LIST-TEMPLATES-AND-LIST-NOTES.md).
insert into fixture_state values (
  'noted_list', public.create_list_v2(
    '10000000-0000-0000-0000-000000000020', 'Pantry', 'Weekly', 'Buy the good olive oil'
  ) #>> '{data,id}'
);
select is(
  (select notes from public.lists
    where id = (select value::uuid from fixture_state where key = 'noted_list')),
  'Buy the good olive oil', 'create_list_v2 stores the shared list note'
);
select is(public.update_list(
  '10000000-0000-0000-0000-000000000021',
  (select value::uuid from fixture_state where key = 'noted_list'), 1, 'Pantry', 'Weekly'
) #>> '{data,notes}', 'Buy the good olive oil', 'legacy update_list preserves an existing note');
select is(public.update_list_v2(
  '10000000-0000-0000-0000-000000000022',
  (select value::uuid from fixture_state where key = 'noted_list'), 2,
  'Pantry', 'Weekly', 'Own brand is fine'
) #>> '{data,notes}', 'Own brand is fine', 'update_list_v2 replaces the note');

insert into fixture_state values (
  'saved_template', public.save_list_template(
    '10000000-0000-0000-0000-000000000023',
    (select value::uuid from fixture_state where key = 'list_a')
  ) #>> '{data,list_id}'
);
select is(
  (select kind from public.lists
    where id = (select value::uuid from fixture_state where key = 'saved_template')),
  'template', 'a saved list becomes a list template'
);
select is((select count(*)::text from public.tasks where list_id = (
  select value::uuid from fixture_state where key = 'saved_template'
)), '2', 'saving a list keeps every task inside it');
select is((select count(*)::text from public.tasks where list_id = (
  select value::uuid from fixture_state where key = 'saved_template'
) and (completed or assignee_id is not null or due_at is not null)),
  '0', 'saved template tasks carry no runtime state');
select is(public.save_list_template(
  '10000000-0000-0000-0000-000000000023',
  (select value::uuid from fixture_state where key = 'list_a')
) #>> '{data,list_id}', (select value from fixture_state where key = 'saved_template'),
  'saving a list as a template is idempotent');
select is(public.save_list_template(
  '10000000-0000-0000-0000-000000000024',
  (select value::uuid from fixture_state where key = 'saved_template')
) #>> '{error,code}', 'NOT_FOUND', 'a list template cannot itself be saved as a template');
select is(
  jsonb_array_length(public.get_task_templates() #> '{data,items}')::text,
  '0', 'saving a list never writes a task template'
);

insert into fixture_state values (
  'noted_template', public.save_list_template(
    '10000000-0000-0000-0000-000000000025',
    (select value::uuid from fixture_state where key = 'noted_list')
  ) #>> '{data,list_id}'
);
select is(
  (select notes from public.lists
    where id = (select value::uuid from fixture_state where key = 'noted_template')),
  'Own brand is fine', 'a saved list template carries the list note'
);
select is(
  (select notes from public.lists where id = (public.copy_template(
    '10000000-0000-0000-0000-000000000026',
    (select value::uuid from fixture_state where key = 'noted_template')
  ) #>> '{data,list_id}')::uuid),
  'Own brand is fine', 'copying a list template carries the note onto the new list'
);

insert into fixture_state values (
  'invite_token', public.create_invitation(
    '10000000-0000-0000-0000-000000000010'
  ) #>> '{data,token}'
);
select is(public.create_invitation(
  '10000000-0000-0000-0000-000000000010'
) #>> '{data,token}', (select value from fixture_state where key = 'invite_token'), 'invitation retry returns same token');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
select is(public.update_profile(
  '10000000-0000-0000-0000-000000000011', 'Carol', 'bg', null
) #>> '{ok}', 'true', 'Carol creates a profile');
select is(public.redeem_invitation(
  '10000000-0000-0000-0000-000000000012',
  (select value from fixture_state where key = 'invite_token')
) #>> '{data,household_id}', (select value from fixture_state where key = 'household_a'), 'Carol redeems invitation');

select is(public.claim_task(
  '10000000-0000-0000-0000-000000000013',
  (select value::uuid from fixture_state where key = 'task_a'), 1
) #>> '{data,assignee_id}', '00000000-0000-0000-0000-000000000003', 'Carol claims task');
select is(public.get_unassigned() #>> '{data,items,0,title}', 'Pack', 'claimed task leaves Unassigned');
select is(public.get_my_tasks() #>> '{data,items,0,title}', 'Clean', 'claimed task appears in My Tasks');
select is(public.set_task_completed(
  '10000000-0000-0000-0000-000000000014',
  (select value::uuid from fixture_state where key = 'task_a'), 2, true
) #>> '{data,completed}', 'true', 'claimed task can be completed');
select is(public.get_my_tasks() #>> '{data,items,0}', null, 'completed task leaves My Tasks');
select is(public.get_list(
  (select value::uuid from fixture_state where key = 'list_a')
) #>> '{data,progress_percent}', '50', 'progress updates from full task count');
select is(public.set_task_completed(
  '10000000-0000-0000-0000-000000000015',
  (select value::uuid from fixture_state where key = 'task_a'), 2, false
) #>> '{error,code}', 'CONFLICT', 'stale completion is rejected');

reset role;
insert into public.profiles (user_id, display_name, locale)
values ('00000000-0000-0000-0000-000000000002', 'Bob', 'en');
insert into public.households (id, name, seed_locale, created_by)
values ('30000000-0000-0000-0000-000000000001', 'Home B', 'en', '00000000-0000-0000-0000-000000000002');
insert into public.memberships (household_id, user_id)
values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002');
insert into public.lists (id, household_id, kind, title, created_by)
values ('30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'active', 'Private B', '00000000-0000-0000-0000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select is((select count(*)::text from public.households), '1', 'RLS hides another household');
select is((select count(*)::text from public.lists where id = '30000000-0000-0000-0000-000000000002'), '0', 'RLS hides another household list');
select is(public.update_list(
  '10000000-0000-0000-0000-000000000016',
  '30000000-0000-0000-0000-000000000002', 1, 'Attack', null
) #>> '{error,code}', 'NOT_FOUND', 'cross-household mutation is non-disclosing');
select is(public.save_list_template(
  '10000000-0000-0000-0000-000000000027', '30000000-0000-0000-0000-000000000002'
) #>> '{error,code}', 'NOT_FOUND', 'a cross-household list cannot be saved as a template');
select is(public.get_members() #>> '{data,0,display_name}', 'Alice', 'member projection returns household identities');
select is(jsonb_array_length(public.get_members() #> '{data}')::text, '2', 'member projection includes both active members');

select is(public.update_task(
  '10000000-0000-0000-0000-000000000017',
  (select value::uuid from fixture_state where key = 'task_a'), 3,
  'Clean kitchen', '00000000-0000-0000-0000-000000000002', null
) #>> '{error,code}', 'VALIDATION', 'foreign-household assignee is rejected');
select is(public.redeem_invitation(
  '10000000-0000-0000-0000-000000000018', 'not-a-real-token'
) #>> '{error,code}', 'VALIDATION', 'short invite token is rejected safely');

select * from finish();
rollback;
