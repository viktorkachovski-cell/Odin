-- Production-safe smoke test: random synthetic identities and household,
-- all writes rolled back. Never uses or changes existing household content.
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
  outsider uuid := current_setting('odin.qa_outsider')::uuid;
  list_id uuid;
  task_id uuid;
  retained_id uuid;
  request_id uuid := gen_random_uuid();
  response jsonb;
  first_response jsonb;
  due timestamptz := '2030-01-01T12:00:00Z';
begin
  response := public.delete_list(gen_random_uuid(), gen_random_uuid(), 1);
  if response #>> '{error,code}' is distinct from 'UNAUTHENTICATED' then raise exception 'unauthenticated guard failed'; end if;
  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform public.update_profile(gen_random_uuid(), 'Deployment QA', 'en', null);
  response := public.create_household(gen_random_uuid(), 'Deployment QA', 'en');
  if response #>> '{ok}' is distinct from 'true' then raise exception 'household setup failed'; end if;
  response := public.create_list(gen_random_uuid(), 'Lifecycle QA', null);
  list_id := (response #>> '{data,id}')::uuid;
  response := public.create_task(gen_random_uuid(), list_id, 'Lifecycle QA', actor, due);
  task_id := (response #>> '{data,id}')::uuid;
  response := public.update_task(gen_random_uuid(), task_id, 1, 'Lifecycle QA', null, due);
  if response #>> '{ok}' is distinct from 'true' or response #>> '{data,assignee_id}' is not null
    or (response #>> '{data,due_at}')::timestamptz is distinct from due then raise exception 'unassign failed'; end if;
  response := public.delete_task(gen_random_uuid(), task_id, 1);
  if response #>> '{error,code}' is distinct from 'CONFLICT' then raise exception 'task conflict guard failed'; end if;
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  perform public.update_profile(gen_random_uuid(), 'Other QA', 'en', null);
  perform public.create_household(gen_random_uuid(), 'Other QA', 'en');
  response := public.delete_task(gen_random_uuid(), task_id, 2);
  if response #>> '{error,code}' is distinct from 'NOT_FOUND' then raise exception 'task isolation failed'; end if;
  response := public.delete_list(gen_random_uuid(), list_id, 1);
  if response #>> '{error,code}' is distinct from 'NOT_FOUND' then raise exception 'list isolation failed'; end if;
  perform set_config('request.jwt.claim.sub', actor::text, true);
  first_response := public.delete_task(request_id, task_id, 2);
  if first_response #>> '{ok}' is distinct from 'true' then raise exception 'task deletion failed'; end if;
  response := public.delete_task(request_id, task_id, 2);
  if response is distinct from first_response then raise exception 'task replay failed'; end if;
  if exists(select 1 from public.tasks where id=task_id) then raise exception 'task remains'; end if;
  response := public.create_task(gen_random_uuid(), list_id, 'Retained QA', null, null);
  retained_id := (response #>> '{data,id}')::uuid;
  response := public.delete_list(gen_random_uuid(), list_id, 2);
  if response #>> '{error,code}' is distinct from 'CONFLICT' then raise exception 'list conflict guard failed'; end if;
  request_id := gen_random_uuid();
  first_response := public.delete_list(request_id, list_id, 1);
  if first_response #>> '{ok}' is distinct from 'true' then raise exception 'list deletion failed'; end if;
  response := public.delete_list(request_id, list_id, 1);
  if response is distinct from first_response then raise exception 'list replay failed'; end if;
  if (select status from public.lists where id=list_id) is distinct from 'archived' then raise exception 'archive failed'; end if;
  if not exists(select 1 from public.tasks where id=retained_id) then raise exception 'archive lost tasks'; end if;
  response := public.delete_task(gen_random_uuid(), retained_id, 1);
  if response #>> '{error,code}' is distinct from 'NOT_FOUND' then raise exception 'archived list guard failed'; end if;
end;
$$;
select 'passed: unassign, delete, archive, conflicts, replay, isolation and archived-list guard' as result;
rollback;
