-- Production-safe smoke test: synthetic household only, all writes rolled back.
-- Covers the task-workflow migrations: stored task state, shared ordering,
-- template task moves, snapshot reads, legacy readers and household isolation.
begin;
do $$
declare actor uuid := gen_random_uuid(); outsider uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role) values
    (actor, 'authenticated', 'authenticated'),
    (outsider, 'authenticated', 'authenticated');
  perform set_config('odin.qa_actor', actor::text, true);
  perform set_config('odin.qa_outsider', outsider::text, true);
end;
$$;
set local role authenticated;
do $$
declare
  actor uuid := current_setting('odin.qa_actor')::uuid;
  outsider uuid := current_setting('odin.qa_outsider')::uuid;
  list_a uuid; list_b uuid; template_id uuid; copy_id uuid;
  task_a uuid; task_b uuid; dated uuid; template_task uuid;
  task_a_version bigint; list_a_version bigint; v bigint;
  response jsonb;
begin
  response := public.get_home_v2();
  if response #>> '{error,code}' is distinct from 'UNAUTHENTICATED' then
    raise exception 'unauthenticated home snapshot guard failed';
  end if;

  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform public.update_profile(gen_random_uuid(), 'Workflow QA', 'en', null);
  perform public.create_household(gen_random_uuid(), 'Workflow QA', 'en');
  list_a := (public.create_list(gen_random_uuid(), 'Smoke A', null) #>> '{data,id}')::uuid;
  list_b := (public.create_list_v2(gen_random_uuid(), 'Smoke B', null, 'Note') #>> '{data,id}')::uuid;
  response := public.get_home_v2();
  if response #>> '{data,items,0,id}' is distinct from list_a::text
    or response #>> '{data,items,1,id}' is distinct from list_b::text then
    raise exception 'legacy and v2 list creation did not append in order';
  end if;

  task_a := (public.create_task(gen_random_uuid(), list_a, 'Task A') #>> '{data,id}')::uuid;
  task_b := (public.create_task_v2(gen_random_uuid(), list_a, 'Task B', null, null, 'Notes') #>> '{data,id}')::uuid;

  -- Stored state is open, blocked or done; display labels are not input.
  response := public.set_task_state(gen_random_uuid(), task_b, 1, 'todo');
  if response #>> '{error,code}' is distinct from 'VALIDATION' then raise exception 'display label accepted as state'; end if;
  response := public.set_task_state(gen_random_uuid(), task_b, 1, 'blocked');
  if response #>> '{data,blocked}' is distinct from 'true' or response #>> '{data,version}' is distinct from '2' then
    raise exception 'blocking failed';
  end if;
  response := public.set_task_state(gen_random_uuid(), task_b, 2, 'done');
  if response #>> '{data,completed}' is distinct from 'true' or response #>> '{data,blocked}' is distinct from 'false' then
    raise exception 'done did not replace blocked';
  end if;
  response := public.set_task_state(gen_random_uuid(), task_b, 3, 'open');
  if response #>> '{data,completed}' is distinct from 'false' or response #>> '{data,blocked}' is distinct from 'false' then
    raise exception 'reopening failed';
  end if;
  perform public.set_task_state(gen_random_uuid(), task_b, 4, 'blocked');
  response := public.update_task_v2(gen_random_uuid(), task_b, 5, 'Task B edited', null, null, 'Notes');
  if response #>> '{data,blocked}' is distinct from 'true' then raise exception 'text edit cleared blocked'; end if;
  response := public.set_task_completed(gen_random_uuid(), task_b, 6, false);
  if response #>> '{data,blocked}' is distinct from 'false' then raise exception 'legacy completion kept blocked'; end if;

  -- Shared ordering: adjacent swaps, version checked, boundary no-op.
  response := public.move_task(gen_random_uuid(), task_b, 7, 'up');
  if response #>> '{ok}' is distinct from 'true' then raise exception 'task move failed'; end if;
  response := public.move_task(gen_random_uuid(), task_b, 7, 'down');
  if response #>> '{error,code}' is distinct from 'CONFLICT' then raise exception 'stale task move accepted'; end if;
  select version into v from public.tasks where id = task_b;
  response := public.move_task(gen_random_uuid(), task_b, v, 'up');
  if response #>> '{ok}' is distinct from 'true' then raise exception 'boundary task move failed'; end if;
  response := public.get_list_v2(list_a);
  if response #>> '{data,tasks,0,id}' is distinct from task_b::text then raise exception 'task order not shared'; end if;

  response := public.move_list(gen_random_uuid(), list_b, 1, 'up');
  if response #>> '{ok}' is distinct from 'true' then raise exception 'list move failed'; end if;
  response := public.move_list(gen_random_uuid(), list_b, 1, 'up');
  if response #>> '{error,code}' is distinct from 'CONFLICT' then raise exception 'stale list move accepted'; end if;
  response := public.get_home_v2();
  if response #>> '{data,items,0,id}' is distinct from list_b::text then raise exception 'list order not shared'; end if;

  -- Templates reset runtime state, and their tasks move but cannot be blocked.
  select version into v from public.tasks where id = task_a;
  perform public.set_task_state(gen_random_uuid(), task_a, v, 'blocked');
  template_id := (public.save_list_template(gen_random_uuid(), list_a) #>> '{data,list_id}')::uuid;
  if (select count(*) from public.tasks where list_id = template_id and not (completed or blocked)) <> 2 then
    raise exception 'template kept task runtime state';
  end if;
  select id, version into template_task, v from public.tasks
  where list_id = template_id order by sort_order limit 1;
  response := public.move_task(gen_random_uuid(), template_task, v, 'down');
  if response #>> '{ok}' is distinct from 'true' then raise exception 'template task move failed'; end if;
  response := public.set_task_state(gen_random_uuid(), template_task, v + 1, 'blocked');
  if response #>> '{error,code}' is distinct from 'NOT_FOUND' then raise exception 'template task accepted a state'; end if;
  copy_id := (public.copy_template(gen_random_uuid(), template_id) #>> '{data,list_id}')::uuid;
  if (select count(*) from public.tasks where list_id = copy_id and not (completed or blocked)) <> 2 then
    raise exception 'copy kept task runtime state';
  end if;

  -- Snapshot reads.
  response := public.get_home_v2();
  if response #>> '{data,items,0,kind}' is distinct from 'template' or (response -> 'data') ? 'next_cursor' then
    raise exception 'home snapshot shape failed';
  end if;
  select version into v from public.tasks where id = task_b;
  perform public.set_task_completed(gen_random_uuid(), task_b, v, true);
  response := public.get_list_v2(list_a);
  if response #>> '{data,total_tasks}' is distinct from '2' or response #>> '{data,completed_tasks}' is distinct from '1'
    or response #>> '{data,progress_percent}' is distinct from '50' or response #>> '{data,tasks,1,id}' is distinct from task_b::text then
    raise exception 'list snapshot counts or completed-last order failed';
  end if;

  dated := (public.create_task_v2(gen_random_uuid(), list_b, 'Dated', null, '2030-10-25T12:00:00Z', null) #>> '{data,id}')::uuid;
  perform public.claim_task(gen_random_uuid(), dated, 1);
  response := public.get_my_tasks_v2();
  if response #>> '{data,items,0,id}' is distinct from dated::text or response #>> '{data,items,0,list_title}' is distinct from 'Smoke B' then
    raise exception 'my tasks snapshot failed';
  end if;
  response := public.get_unassigned_v2();
  if not exists (select 1 from jsonb_array_elements(response #> '{data,items}') i where i ->> 'id' = task_a::text and i ->> 'blocked' = 'true')
    or exists (select 1 from jsonb_array_elements(response #> '{data,items}') i where i ->> 'id' in (dated::text, task_b::text)) then
    raise exception 'unassigned snapshot failed';
  end if;
  response := public.get_all_tasks('2030-10-25T00:00:00Z', '2030-10-26T00:00:00Z');
  if jsonb_array_length(response #> '{data,items}') <> 1 or response #>> '{data,items,0,id}' is distinct from dated::text then
    raise exception 'all tasks date range failed';
  end if;
  response := public.get_all_tasks('2030-10-26T00:00:00Z', '2030-10-27T00:00:00Z');
  if jsonb_array_length(response #> '{data,items}') <> 0 then raise exception 'all tasks upper bound failed'; end if;
  response := public.get_all_tasks(null, null, true);
  if exists (select 1 from jsonb_array_elements(response #> '{data,items}') i where i ->> 'id' = dated::text) then
    raise exception 'undated filter included a dated task';
  end if;
  response := public.get_all_tasks('2030-10-27T00:00:00Z', '2030-10-25T00:00:00Z');
  if response #>> '{error,code}' is distinct from 'VALIDATION' then raise exception 'reversed range accepted'; end if;
  response := public.get_all_tasks('2030-10-25T00:00:00Z', null, true);
  if response #>> '{error,code}' is distinct from 'VALIDATION' then raise exception 'undated with bounds accepted'; end if;

  -- Installed clients keep their paged readers.
  if public.get_home() #>> '{ok}' is distinct from 'true'
    or public.get_list(list_a) #>> '{ok}' is distinct from 'true'
    or public.get_my_tasks() #>> '{data,items,0,task_id}' is distinct from dated::text
    or public.get_unassigned() #>> '{ok}' is distinct from 'true' then
    raise exception 'legacy paged readers failed';
  end if;

  select version into task_a_version from public.tasks where id = task_a;
  select version into list_a_version from public.lists where id = list_a;
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  perform public.update_profile(gen_random_uuid(), 'Other Workflow QA', 'en', null);
  perform public.create_household(gen_random_uuid(), 'Other Workflow QA', 'en');
  if public.get_list_v2(list_a) #>> '{error,code}' is distinct from 'NOT_FOUND'
    or public.move_task(gen_random_uuid(), task_a, task_a_version, 'down') #>> '{error,code}' is distinct from 'NOT_FOUND'
    or public.set_task_state(gen_random_uuid(), task_a, task_a_version, 'open') #>> '{error,code}' is distinct from 'NOT_FOUND'
    or public.move_list(gen_random_uuid(), list_a, list_a_version, 'up') #>> '{error,code}' is distinct from 'NOT_FOUND'
    or jsonb_array_length(public.get_all_tasks() #> '{data,items}') <> 0
    or jsonb_array_length(public.get_home_v2() #> '{data,items}') <> 0 then
    raise exception 'task workflow household isolation failed';
  end if;
end;
$$;
select 'passed: task state, shared order, template moves, snapshots, legacy readers and isolation' as result;
rollback;
