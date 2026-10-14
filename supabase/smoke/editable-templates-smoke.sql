-- Production-safe smoke test: synthetic household only, all writes rolled back.
-- Proves 20261014130000_editable_list_templates.sql on a hosted database.
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
  v_list_id uuid; v_template_id uuid; v_task_id uuid; v_added_id uuid; v_copy_id uuid;
  response jsonb;
begin
  perform set_config('request.jwt.claim.sub', actor::text, true);
  perform public.update_profile(gen_random_uuid(), 'Template Edit QA', 'en', null);
  perform public.create_household(gen_random_uuid(), 'Template Edit QA', 'en');
  v_list_id := (public.create_list(gen_random_uuid(), 'Weekend', null) #>> '{data,id}')::uuid;
  perform public.create_task(gen_random_uuid(), v_list_id, 'Pack bags');
  v_template_id := (public.save_list_template(gen_random_uuid(), v_list_id) #>> '{data,list_id}')::uuid;
  select id into v_task_id from public.tasks where list_id = v_template_id;

  response := public.update_list_v2(gen_random_uuid(), v_template_id, 1, 'Weekend away', 'Two nights', 'Check the forecast');
  if response #>> '{data,title}' is distinct from 'Weekend away'
    or response #>> '{data,kind}' is distinct from 'template' then
    raise exception 'template text edit failed: %', response;
  end if;

  response := public.create_task_v2(gen_random_uuid(), v_template_id, 'Water plants', null, null, 'Ask a neighbour');
  if response #>> '{ok}' is distinct from 'true' then raise exception 'template task add failed: %', response; end if;
  v_added_id := (response #>> '{data,id}')::uuid;
  response := public.create_task_v2(gen_random_uuid(), v_template_id, 'Dated', null, '2030-01-01T09:00:00Z', null);
  if response #>> '{error,message_key}' is distinct from 'error.template_task_runtime' then
    raise exception 'template task accepted a deadline: %', response;
  end if;

  response := public.update_task_v2(gen_random_uuid(), v_task_id, 1, 'Pack light', null, null, 'One bag each');
  if response #>> '{data,title}' is distinct from 'Pack light' then raise exception 'template task edit failed: %', response; end if;
  response := public.update_task_v2(gen_random_uuid(), v_task_id, 2, 'Pack light', actor, null, null);
  if response #>> '{error,message_key}' is distinct from 'error.template_task_runtime' then
    raise exception 'template task accepted an assignee: %', response;
  end if;
  response := public.claim_task(gen_random_uuid(), v_task_id, 2);
  if response #>> '{error,code}' is distinct from 'NOT_FOUND' then raise exception 'template task was claimable: %', response; end if;

  response := public.delete_task(gen_random_uuid(), v_added_id, 1);
  if response #>> '{ok}' is distinct from 'true' then raise exception 'template task delete failed: %', response; end if;

  v_copy_id := (public.copy_template(gen_random_uuid(), v_template_id) #>> '{data,list_id}')::uuid;
  if (select string_agg(title, ',' order by sort_order) from public.tasks where list_id = v_copy_id)
    is distinct from 'Pack light' then
    raise exception 'copy did not use the edited template';
  end if;

  perform set_config('request.jwt.claim.sub', outsider::text, true);
  perform public.update_profile(gen_random_uuid(), 'Other Template QA', 'en', null);
  perform public.create_household(gen_random_uuid(), 'Other Template QA', 'en');
  response := public.update_list_v2(gen_random_uuid(), v_template_id, 2, 'Mine now', null, null);
  if response #>> '{error,code}' is distinct from 'NOT_FOUND' then
    raise exception 'cross-household template edit isolation failed: %', response;
  end if;
  response := public.delete_task(gen_random_uuid(), v_task_id, 2);
  if response #>> '{error,code}' is distinct from 'NOT_FOUND' then
    raise exception 'cross-household template task isolation failed: %', response;
  end if;
end;
$$;
select 'passed: template text, task add/edit/delete, runtime refusals, claim guard, copy and isolation' as result;
rollback;
