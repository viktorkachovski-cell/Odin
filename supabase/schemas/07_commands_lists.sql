-- List and task commands. Cross-household and nonexistent IDs return the same
-- non-disclosing NOT_FOUND.

create or replace function private.load_list(
  p_household uuid, p_list_id uuid, p_kind text
) returns public.lists language plpgsql security definer set search_path = ''
as $$
declare v_list public.lists;
begin
  select * into v_list from public.lists l
  where l.id = p_list_id and l.household_id = p_household
  for update;
  if not found then perform private.fail('NOT_FOUND'); end if;
  if p_kind is not null and v_list.kind <> p_kind then perform private.fail('NOT_FOUND'); end if;
  if v_list.status <> 'open' then perform private.fail('CONFLICT'); end if;
  return v_list;
end;
$$;

create or replace function private.load_task(
  p_household uuid, p_task_id uuid
) returns public.tasks language plpgsql security definer set search_path = ''
as $$
declare v_task public.tasks;
begin
  select * into v_task from public.tasks t
  where t.id = p_task_id and t.household_id = p_household
  for update;
  if not found then perform private.fail('NOT_FOUND'); end if;
  -- Active commands never edit template content.
  if v_task.list_kind <> 'active' then perform private.fail('NOT_FOUND'); end if;
  return v_task;
end;
$$;

-- Assignment must serialize with revocation: the membership row is locked, so a
-- concurrent deactivation cannot slip in after validation.
create or replace function private.require_assignable(p_household uuid, p_user uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_status text;
begin
  if p_user is null then return; end if;
  select m.status into v_status from public.memberships m
  where m.household_id = p_household and m.user_id = p_user
  for update;
  if not found or v_status <> 'active' then
    perform private.fail('VALIDATION', 'validation.assignee_id.not_active_member');
  end if;
end;
$$;

create or replace function private.cmd_create_list(
  p_request_id uuid, p_title text, p_subtitle text
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_title text; v_subtitle text; v_payload jsonb; v_hash text;
  v_result jsonb; v_household uuid; v_list public.lists; v_constraint text;
begin
  v_title := private.require_text(p_title, 'title', 1, 160, true);
  v_subtitle := private.require_text(p_subtitle, 'subtitle', 1, 300, false);
  v_payload := jsonb_build_object('title', v_title, 'subtitle', v_subtitle);
  v_hash := private.payload_hash('create_list', v_payload);
  v_result := private.replay(v_actor, p_request_id, v_hash);
  if v_result is not null then return private.ok(v_result); end if;

  v_household := private.require_active_household(v_actor);
  begin
    insert into public.lists (household_id, kind, title, subtitle, status, created_by)
    values (v_household, 'active', v_title, v_subtitle, 'open', v_actor)
    returning * into v_list;
    v_result := private.list_dto(v_list);
    perform private.record_receipt(
      v_actor, v_household, p_request_id, 'create_list', v_hash, v_result);
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'command_receipts_actor_request_unique' then raise; end if;
    v_result := private.replay(v_actor, p_request_id, v_hash);
    if v_result is null then perform private.fail('CONFLICT'); end if;
  end;
  return private.ok(v_result);
end;
$$;

create or replace function private.cmd_update_list(
  p_request_id uuid, p_list_id uuid, p_expected_version bigint,
  p_title text, p_subtitle text
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_title text; v_subtitle text; v_payload jsonb; v_hash text;
  v_result jsonb; v_household uuid; v_list public.lists; v_constraint text;
begin
  v_title := private.require_text(p_title, 'title', 1, 160, true);
  v_subtitle := private.require_text(p_subtitle, 'subtitle', 1, 300, false);
  v_payload := jsonb_build_object(
    'list_id', p_list_id, 'expected_version', p_expected_version,
    'title', v_title, 'subtitle', v_subtitle);
  v_hash := private.payload_hash('update_list', v_payload);
  v_result := private.replay(v_actor, p_request_id, v_hash);
  if v_result is not null then return private.ok(v_result); end if;

  v_household := private.require_active_household(v_actor);
  v_list := private.load_list(v_household, p_list_id, 'active');
  if v_list.version <> p_expected_version then
    perform private.fail('CONFLICT', 'error.conflict', v_list.version);
  end if;

  begin
    update public.lists l
    set title = v_title, subtitle = v_subtitle, updated_at = now(), version = l.version + 1
    where l.id = p_list_id returning * into v_list;
    v_result := private.list_dto(v_list);
    perform private.record_receipt(
      v_actor, v_household, p_request_id, 'update_list', v_hash, v_result);
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'command_receipts_actor_request_unique' then raise; end if;
    v_result := private.replay(v_actor, p_request_id, v_hash);
    if v_result is null then perform private.fail('CONFLICT'); end if;
  end;
  return private.ok(v_result);
end;
$$;

-- Copies text and order only. Ownership, deadlines and completion are reset, and the
-- source template is untouched. Distinct request IDs legitimately produce distinct
-- copies: copies are never deduplicated by template or title.
create or replace function private.cmd_copy_template(
  p_request_id uuid, p_template_id uuid
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_payload jsonb; v_hash text; v_result jsonb; v_household uuid;
  v_template public.lists; v_list public.lists; v_constraint text;
begin
  v_payload := jsonb_build_object('template_id', p_template_id);
  v_hash := private.payload_hash('copy_template', v_payload);
  v_result := private.replay(v_actor, p_request_id, v_hash);
  if v_result is not null then return private.ok(v_result); end if;

  v_household := private.require_active_household(v_actor);
  v_template := private.load_list(v_household, p_template_id, 'template');

  begin
    insert into public.lists (household_id, kind, title, subtitle, status, created_by)
    values (v_household, 'active', v_template.title, v_template.subtitle, 'open', v_actor)
    returning * into v_list;

    insert into public.tasks
      (household_id, list_id, list_kind, title, sort_order, completed,
       assignee_id, due_at, created_by)
    select v_household, v_list.id, 'active', t.title, t.sort_order, false,
           null, null, v_actor
    from public.tasks t
    where t.household_id = v_household and t.list_id = p_template_id
    order by t.sort_order, t.id;

    v_result := jsonb_build_object('list_id', v_list.id);
    perform private.record_receipt(
      v_actor, v_household, p_request_id, 'copy_template', v_hash, v_result);
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'command_receipts_actor_request_unique' then raise; end if;
    v_result := private.replay(v_actor, p_request_id, v_hash);
    if v_result is null then perform private.fail('CONFLICT'); end if;
  end;
  return private.ok(v_result);
end;
$$;
