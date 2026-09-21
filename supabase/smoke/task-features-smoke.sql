-- Production-safe smoke test: synthetic household only, all writes rolled back.
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
  list_id uuid; task_id uuid; response jsonb; replay jsonb; request_id uuid := gen_random_uuid();
begin
  response := public.get_task_templates();
  if response #>> '{error,code}' is distinct from 'UNAUTHENTICATED' then
    raise exception 'unauthenticated template read guard failed';
  end if;
  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform public.update_profile(gen_random_uuid(), 'Task Feature QA', 'en', null);
  perform public.create_household(gen_random_uuid(), 'Task Feature QA', 'en');
  response := public.create_list(gen_random_uuid(), 'Task Feature QA', null);
  list_id := (response #>> '{data,id}')::uuid;

  response := public.create_task_v2(
    request_id, list_id, repeat('Т', 500), null, '2030-01-01T21:59:59.999Z', 'Shared notes'
  );
  if response #>> '{ok}' is distinct from 'true' or response #>> '{data,notes}' is distinct from 'Shared notes' then
    raise exception 'note-aware task creation failed';
  end if;
  task_id := (response #>> '{data,id}')::uuid;
  replay := public.create_task_v2(
    request_id, list_id, repeat('Т', 500), null, '2030-01-01T21:59:59.999Z', 'Shared notes'
  );
  if replay is distinct from response then raise exception 'task v2 replay failed'; end if;
  response := public.create_task_v2(gen_random_uuid(), list_id, repeat('x', 501), null, null, null);
  if response #>> '{error,code}' is distinct from 'VALIDATION' then raise exception 'task title limit failed'; end if;

  response := public.update_task_v2(gen_random_uuid(), task_id, 1, 'Edited', null, null, 'Edited notes');
  if response #>> '{data,notes}' is distinct from 'Edited notes' then raise exception 'notes edit failed'; end if;
  response := public.update_task(gen_random_uuid(), task_id, 2, 'Legacy compatible', null, null);
  if response #>> '{data,notes}' is distinct from 'Edited notes' then raise exception 'legacy update erased notes'; end if;
  response := public.save_task_template(gen_random_uuid(), 'Edited', 'Edited notes');
  if response #>> '{ok}' is distinct from 'true' then raise exception 'template save failed'; end if;
  response := public.get_task_templates();
  if response #>> '{data,items,0,notes}' is distinct from 'Edited notes' then raise exception 'template read failed'; end if;

  perform set_config('request.jwt.claim.sub', outsider::text, true);
  perform public.update_profile(gen_random_uuid(), 'Other Feature QA', 'en', null);
  perform public.create_household(gen_random_uuid(), 'Other Feature QA', 'en');
  response := public.get_task_templates();
  if jsonb_array_length(response #> '{data,items}') <> 0 then raise exception 'template household isolation failed'; end if;
  response := public.update_task_v2(gen_random_uuid(), task_id, 2, 'Cross household', null, null, null);
  if response #>> '{error,code}' is distinct from 'NOT_FOUND' then raise exception 'task household isolation failed'; end if;
end;
$$;
select 'passed: notes, title limit, templates, replay and household isolation' as result;
rollback;
