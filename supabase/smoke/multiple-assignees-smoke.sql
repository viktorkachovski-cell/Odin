-- Production-safe smoke test: synthetic households only, all writes rolled back.
-- Proves 20261104190000_multiple_task_assignees.sql on a hosted database.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role) values
    (a, 'authenticated', 'authenticated'), (b, 'authenticated', 'authenticated'),
    (c, 'authenticated', 'authenticated'), (outsider, 'authenticated', 'authenticated');
  perform set_config('odin.qa_a', a::text, true);
  perform set_config('odin.qa_b', b::text, true);
  perform set_config('odin.qa_c', c::text, true);
  perform set_config('odin.qa_outsider', outsider::text, true);
end;
$$;
-- Members join through the owner-side fixture, as the other smoke scripts do
-- for a second member; the commands under test all run as `authenticated`.
do $$
declare
  a uuid := current_setting('odin.qa_a')::uuid;
  b uuid := current_setting('odin.qa_b')::uuid;
  c uuid := current_setting('odin.qa_c')::uuid;
  v_household uuid;
begin
  insert into public.profiles (user_id, display_name) values (a, 'QA A'), (b, 'QA B'), (c, 'QA C');
  insert into public.households (name, seed_locale, created_by) values ('Assignee QA', 'en', a)
  returning id into v_household;
  insert into public.memberships (household_id, user_id) values (v_household, a), (v_household, b), (v_household, c);
end;
$$;
set local role authenticated;
do $$
declare
  a uuid := current_setting('odin.qa_a')::uuid;
  b uuid := current_setting('odin.qa_b')::uuid;
  c uuid := current_setting('odin.qa_c')::uuid;
  outsider uuid := current_setting('odin.qa_outsider')::uuid;
  v_list uuid; v_task uuid; response jsonb; v_version bigint;
begin
  perform set_config('request.jwt.claim.sub', a::text, true);
  v_list := (public.create_list(gen_random_uuid(), 'Assignee QA', null) #>> '{data,id}')::uuid;

  response := public.create_task_v3(gen_random_uuid(), v_list, 'Shared chore', array[b, a], null, null);
  if response #>> '{ok}' is distinct from 'true' or jsonb_array_length(response #> '{data,assignee_ids}') <> 2 then
    raise exception 'two-assignee create failed: %', response;
  end if;
  v_task := (response #>> '{data,id}')::uuid;

  response := public.add_task_assignee(gen_random_uuid(), v_task, c);
  if jsonb_array_length(response #> '{data,assignee_ids}') <> 3 then raise exception 'add failed: %', response; end if;
  response := public.remove_task_assignee(gen_random_uuid(), v_task, a);
  if jsonb_array_length(response #> '{data,assignee_ids}') <> 2 then raise exception 'remove failed: %', response; end if;
  v_version := (response #>> '{data,version}')::bigint;

  perform set_config('request.jwt.claim.sub', b::text, true);
  if (select count(*) from jsonb_array_elements(public.get_my_tasks_v2() #> '{data,items}') i
      where i ->> 'id' = v_task::text) <> 1 then
    raise exception 'assigned task is not in Mine exactly once';
  end if;
  response := public.set_task_completed(gen_random_uuid(), v_task, v_version, true);
  if response #>> '{data,completed}' is distinct from 'true'
    or jsonb_array_length(response #> '{data,assignee_ids}') <> 2 then
    raise exception 'completion lost assignments: %', response;
  end if;

  response := public.update_task_v2(gen_random_uuid(), v_task, v_version + 1, 'Shared chore', null, null, null);
  if response #>> '{error,code}' is distinct from 'CONFLICT' then
    raise exception 'legacy editor was allowed to erase assignees: %', response;
  end if;
  response := public.set_task_assignees(gen_random_uuid(), v_task, v_version + 1, '{}');
  if response #>> '{ok}' is distinct from 'true' or jsonb_array_length(response #> '{data,assignee_ids}') <> 0 then
    raise exception 'clear failed: %', response;
  end if;

  response := public.add_task_assignee(gen_random_uuid(), v_task, outsider);
  if response #>> '{error,code}' is distinct from 'VALIDATION' then
    raise exception 'cross-household assignee accepted: %', response;
  end if;

  perform set_config('request.jwt.claim.sub', outsider::text, true);
  response := public.get_task_v2(v_task);
  if response #>> '{error,code}' is distinct from 'NOT_FOUND' then
    raise exception 'task visible outside its household: %', response;
  end if;
end;
$$;
select 'passed: multi-assignee create, add, remove, Mine, completion, legacy refusal, clear, isolation' as result;
rollback;
