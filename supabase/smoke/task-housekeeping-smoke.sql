-- Production-safe smoke test for delete_completed_tasks and the chronological
-- tie-breaker: random synthetic identities and household, all writes rolled
-- back. Never uses or changes existing household content.
begin;
do $$
declare
  actor uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
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
  qa_list uuid;
begin
  if public.delete_completed_tasks(gen_random_uuid(), gen_random_uuid(), array[gen_random_uuid()], array[1]::bigint[]) #>> '{error,code}'
    is distinct from 'UNAUTHENTICATED' then
    raise exception 'unauthenticated guard failed';
  end if;
  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform public.update_profile(gen_random_uuid(), 'Housekeeping QA', 'en', null);
  if public.create_household(gen_random_uuid(), 'Housekeeping QA', 'en') #>> '{ok}' is distinct from 'true' then
    raise exception 'household setup failed';
  end if;
  qa_list := (public.create_list(gen_random_uuid(), 'Housekeeping QA', null) #>> '{data,id}')::uuid;
  perform set_config('odin.qa_list', qa_list::text, true);
  perform set_config('odin.qa_old', public.create_task(gen_random_uuid(), qa_list, 'Older') #>> '{data,id}', true);
  perform set_config('odin.qa_new', public.create_task(gen_random_uuid(), qa_list, 'Newer') #>> '{data,id}', true);
  perform set_config('odin.qa_open', public.create_task(gen_random_uuid(), qa_list, 'Stays open') #>> '{data,id}', true);
end;
$$;
-- One transaction shares one now(), so age the task with the larger id: an
-- id-only order would then put it last.
reset role;
update public.tasks set created_at = now() - interval '1 day'
where id = greatest(current_setting('odin.qa_old')::uuid, current_setting('odin.qa_new')::uuid);
set local role authenticated;
do $$
declare
  actor uuid := current_setting('odin.qa_actor')::uuid;
  outsider uuid := current_setting('odin.qa_outsider')::uuid;
  qa_list uuid := current_setting('odin.qa_list')::uuid;
  old_id uuid := current_setting('odin.qa_old')::uuid;
  new_id uuid := current_setting('odin.qa_new')::uuid;
  oldest uuid := greatest(old_id, new_id);
  old_version bigint;
  new_version bigint;
  response jsonb;
begin
  perform set_config('request.jwt.claim.sub', actor::text, true);
  if public.get_all_tasks() #>> '{data,items,0,id}' is distinct from oldest::text then
    raise exception 'deadline ties are not oldest first';
  end if;

  old_version := (public.set_task_state(gen_random_uuid(), old_id, (select version from public.tasks where id = old_id), 'done') #>> '{data,version}')::bigint;
  new_version := (public.set_task_state(gen_random_uuid(), new_id, (select version from public.tasks where id = new_id), 'done') #>> '{data,version}')::bigint;

  response := public.delete_completed_tasks(gen_random_uuid(), qa_list, array[old_id, new_id], array[old_version, new_version - 1]);
  if response #>> '{error,code}' is distinct from 'CONFLICT' then raise exception 'stale batch was not rejected'; end if;
  if (select count(*) from public.tasks where list_id = qa_list and id in (old_id, new_id)) <> 2 then
    raise exception 'rejected batch deleted tasks';
  end if;

  perform set_config('request.jwt.claim.sub', outsider::text, true);
  perform public.update_profile(gen_random_uuid(), 'Other Housekeeping QA', 'en', null);
  perform public.create_household(gen_random_uuid(), 'Other Housekeeping QA', 'en');
  if public.delete_completed_tasks(gen_random_uuid(), qa_list, array[old_id, new_id], array[old_version, new_version]) #>> '{error,code}'
    is distinct from 'NOT_FOUND' then
    raise exception 'batch delete crossed households';
  end if;

  perform set_config('request.jwt.claim.sub', actor::text, true);
  response := public.delete_completed_tasks(gen_random_uuid(), qa_list, array[old_id, new_id], array[old_version, new_version]);
  if response #>> '{data,deleted}' is distinct from '2' then raise exception 'confirmed batch was not deleted: %', response; end if;
  if (select string_agg(title, ',') from public.tasks t where t.list_id = qa_list) is distinct from 'Stays open' then
    raise exception 'batch delete touched an open task';
  end if;
end;
$$;
select 'passed: chronological tie-breaker, batch delete conflict, isolation and success' as result;
rollback;
