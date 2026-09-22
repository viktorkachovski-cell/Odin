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
  v_list_id uuid; v_template_id uuid; v_copied_id uuid; v_task_id uuid;
  response jsonb; replay jsonb; request_id uuid := gen_random_uuid();
begin
  response := public.save_list_template(gen_random_uuid(), gen_random_uuid());
  if response #>> '{error,code}' is distinct from 'UNAUTHENTICATED' then
    raise exception 'unauthenticated list-template guard failed';
  end if;

  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform public.update_profile(gen_random_uuid(), 'List Template QA', 'en', null);
  perform public.create_household(gen_random_uuid(), 'List Template QA', 'en');

  response := public.create_list_v2(gen_random_uuid(), 'Pantry', 'Weekly', 'Buy the good olive oil');
  if response #>> '{data,notes}' is distinct from 'Buy the good olive oil' then
    raise exception 'list note creation failed';
  end if;
  v_list_id := (response #>> '{data,id}')::uuid;

  response := public.create_list_v2(gen_random_uuid(), 'Too long', null, repeat('x', 5001));
  if response #>> '{error,code}' is distinct from 'VALIDATION' then
    raise exception 'list note limit failed';
  end if;

  response := public.update_list(gen_random_uuid(), v_list_id, 1, 'Pantry', 'Weekly');
  if response #>> '{data,notes}' is distinct from 'Buy the good olive oil' then
    raise exception 'legacy update_list erased the list note';
  end if;
  response := public.update_list_v2(
    gen_random_uuid(), v_list_id, 2, 'Pantry', 'Weekly', 'Own brand is fine'
  );
  if response #>> '{data,notes}' is distinct from 'Own brand is fine' then
    raise exception 'update_list_v2 note edit failed';
  end if;

  response := public.create_task_v2(
    gen_random_uuid(), v_list_id, 'Olive oil', actor, '2030-01-01T21:59:59.999Z', 'Aisle 4'
  );
  v_task_id := (response #>> '{data,id}')::uuid;
  perform public.set_task_completed(gen_random_uuid(), v_task_id, 1, true);
  perform public.create_task_v2(gen_random_uuid(), v_list_id, 'Rice', null, null, null);

  response := public.save_list_template(request_id, v_list_id);
  if response #>> '{ok}' is distinct from 'true' then raise exception 'save_list_template failed'; end if;
  v_template_id := (response #>> '{data,list_id}')::uuid;
  replay := public.save_list_template(request_id, v_list_id);
  if replay is distinct from response then raise exception 'save_list_template replay failed'; end if;

  if (select kind from public.lists where id = v_template_id) is distinct from 'template' then
    raise exception 'a saved list did not become a template';
  end if;
  if (select notes from public.lists where id = v_template_id) is distinct from 'Own brand is fine' then
    raise exception 'a saved template lost the list note';
  end if;
  if (select count(*) from public.tasks where list_id = v_template_id) <> 2 then
    raise exception 'a saved template lost tasks';
  end if;
  if exists (
    select 1 from public.tasks
    where list_id = v_template_id and (completed or assignee_id is not null or due_at is not null)
  ) then
    raise exception 'a saved template kept task runtime state';
  end if;
  if (select notes from public.tasks where list_id = v_template_id and title = 'Olive oil')
    is distinct from 'Aisle 4' then
    raise exception 'a saved template lost a task note';
  end if;
  if jsonb_array_length(public.get_task_templates() #> '{data,items}') <> 0 then
    raise exception 'saving a list wrote a task template';
  end if;

  response := public.save_list_template(gen_random_uuid(), v_template_id);
  if response #>> '{error,code}' is distinct from 'NOT_FOUND' then
    raise exception 'a list template must not be saveable as a template';
  end if;

  response := public.copy_template(gen_random_uuid(), v_template_id);
  v_copied_id := (response #>> '{data,list_id}')::uuid;
  if (select notes from public.lists where id = v_copied_id) is distinct from 'Own brand is fine' then
    raise exception 'copy_template lost the list note';
  end if;

  if (select count(*) from public.tasks where list_id = v_copied_id) <> 2 then
    raise exception 'copy_template lost tasks';
  end if;
  if (public.get_home() #> '{data,items}') @> '[{"notes": "Own brand is fine"}]'::jsonb is not true then
    raise exception 'get_home does not project the list note';
  end if;

  -- A saved template must be removable, and removing it must archive rather
  -- than drop (docs/18-LIST-TASK-LIFECYCLE.md).
  response := public.delete_list(gen_random_uuid(), v_template_id, 1);
  if response #>> '{data,list_id}' is distinct from v_template_id::text then
    raise exception 'a list template could not be deleted: %', response;
  end if;
  if (select status from public.lists where id = v_template_id) is distinct from 'archived' then
    raise exception 'deleting a template did not archive it';
  end if;
  if (select count(*) from public.tasks where list_id = v_template_id) <> 2 then
    raise exception 'a deleted template lost its tasks';
  end if;
  if (public.get_home() #> '{data,items}') @> jsonb_build_array(
    jsonb_build_object('id', v_template_id)
  ) then
    raise exception 'a deleted template is still on Home';
  end if;
  response := public.copy_template(gen_random_uuid(), v_template_id);
  if response #>> '{error,code}' is distinct from 'NOT_FOUND' then
    raise exception 'a deleted template can still be copied: %', response;
  end if;
  response := public.delete_list(gen_random_uuid(), v_template_id, 2);
  if response #>> '{error,code}' is distinct from 'NOT_FOUND' then
    raise exception 'an archived template was deleted twice: %', response;
  end if;

  perform set_config('request.jwt.claim.sub', outsider::text, true);
  perform public.update_profile(gen_random_uuid(), 'Other List QA', 'en', null);
  perform public.create_household(gen_random_uuid(), 'Other List QA', 'en');
  response := public.save_list_template(gen_random_uuid(), v_list_id);
  if response #>> '{error,code}' is distinct from 'NOT_FOUND' then
    raise exception 'cross-household list-template isolation failed';
  end if;
end;
$$;
select 'passed: list notes, legacy preservation, list templates, replay, reset, deletion and isolation' as result;
rollback;
