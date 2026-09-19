-- Task commands. Every edit is version-checked; nothing is last-write-wins.

create or replace function private.cmd_create_task(
  p_request_id uuid, p_list_id uuid, p_title text, p_assignee_id uuid, p_due_at timestamptz
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_title text; v_payload jsonb; v_hash text; v_result jsonb;
  v_household uuid; v_task public.tasks; v_order integer; v_constraint text;
begin
  v_title := private.require_text(p_title, 'title', 1, 160, true);
  v_payload := jsonb_build_object(
    'list_id', p_list_id, 'title', v_title,
    'assignee_id', p_assignee_id, 'due_at', p_due_at);
  v_hash := private.payload_hash('create_task', v_payload);
  v_result := private.replay(v_actor, p_request_id, v_hash);
  if v_result is not null then return private.ok(v_result); end if;

  v_household := private.require_active_household(v_actor);
  -- Parent list is locked first, then the membership row, matching the contract's
  -- lock order and making the appended sort_order collision-free.
  perform private.load_list(v_household, p_list_id, 'active');
  perform private.require_assignable(v_household, p_assignee_id);

  select coalesce(max(t.sort_order), 0) + 1 into v_order
  from public.tasks t where t.household_id = v_household and t.list_id = p_list_id;

  begin
    insert into public.tasks
      (household_id, list_id, list_kind, title, sort_order, assignee_id, due_at, created_by)
    values
      (v_household, p_list_id, 'active', v_title, v_order, p_assignee_id, p_due_at, v_actor)
    returning * into v_task;
    v_result := private.task_dto(v_task);
    perform private.record_receipt(
      v_actor, v_household, p_request_id, 'create_task', v_hash, v_result);
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'command_receipts_actor_request_unique' then raise; end if;
    v_result := private.replay(v_actor, p_request_id, v_hash);
    if v_result is null then perform private.fail('CONFLICT'); end if;
  end;
  return private.ok(v_result);
end;
$$;

create or replace function private.cmd_update_task(
  p_request_id uuid, p_task_id uuid, p_expected_version bigint,
  p_title text, p_assignee_id uuid, p_due_at timestamptz
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_title text; v_payload jsonb; v_hash text; v_result jsonb;
  v_household uuid; v_task public.tasks; v_constraint text;
begin
  v_title := private.require_text(p_title, 'title', 1, 160, true);
  v_payload := jsonb_build_object(
    'task_id', p_task_id, 'expected_version', p_expected_version, 'title', v_title,
    'assignee_id', p_assignee_id, 'due_at', p_due_at);
  v_hash := private.payload_hash('update_task', v_payload);
  v_result := private.replay(v_actor, p_request_id, v_hash);
  if v_result is not null then return private.ok(v_result); end if;

  v_household := private.require_active_household(v_actor);
  v_task := private.load_task(v_household, p_task_id);
  if v_task.version <> p_expected_version then
    perform private.fail('CONFLICT', 'error.conflict', v_task.version);
  end if;
  perform private.require_assignable(v_household, p_assignee_id);

  begin
    -- Completion state is deliberately untouched here.
    update public.tasks t
    set title = v_title, assignee_id = p_assignee_id, due_at = p_due_at,
        updated_at = now(), version = t.version + 1
    where t.id = p_task_id returning * into v_task;
    v_result := private.task_dto(v_task);
    perform private.record_receipt(
      v_actor, v_household, p_request_id, 'update_task', v_hash, v_result);
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'command_receipts_actor_request_unique' then raise; end if;
    v_result := private.replay(v_actor, p_request_id, v_hash);
    if v_result is null then perform private.fail('CONFLICT'); end if;
  end;
  return private.ok(v_result);
end;
$$;

-- Explicit desired state, never a toggle: a retry cannot invert completion.
create or replace function private.cmd_set_task_completed(
  p_request_id uuid, p_task_id uuid, p_expected_version bigint, p_completed boolean
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_payload jsonb; v_hash text; v_result jsonb;
  v_household uuid; v_task public.tasks; v_constraint text;
begin
  if p_completed is null then
    perform private.fail('VALIDATION', 'validation.completed.required');
  end if;
  v_payload := jsonb_build_object(
    'task_id', p_task_id, 'expected_version', p_expected_version, 'completed', p_completed);
  v_hash := private.payload_hash('set_task_completed', v_payload);
  v_result := private.replay(v_actor, p_request_id, v_hash);
  if v_result is not null then return private.ok(v_result); end if;

  v_household := private.require_active_household(v_actor);
  v_task := private.load_task(v_household, p_task_id);
  if v_task.version <> p_expected_version then
    perform private.fail('CONFLICT', 'error.conflict', v_task.version);
  end if;

  begin
    update public.tasks t
    set completed = p_completed, updated_at = now(), version = t.version + 1
    where t.id = p_task_id returning * into v_task;
    v_result := private.task_dto(v_task);
    perform private.record_receipt(
      v_actor, v_household, p_request_id, 'set_task_completed', v_hash, v_result);
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'command_receipts_actor_request_unique' then raise; end if;
    v_result := private.replay(v_actor, p_request_id, v_hash);
    if v_result is null then perform private.fail('CONFLICT'); end if;
  end;
  return private.ok(v_result);
end;
$$;

-- Eligibility is checked inside the transaction under the task's row lock, so
-- simultaneous claims produce exactly one assignee.
create or replace function private.cmd_claim_task(
  p_request_id uuid, p_task_id uuid, p_expected_version bigint
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_payload jsonb; v_hash text; v_result jsonb;
  v_household uuid; v_task public.tasks; v_constraint text;
begin
  v_payload := jsonb_build_object('task_id', p_task_id, 'expected_version', p_expected_version);
  v_hash := private.payload_hash('claim_task', v_payload);
  v_result := private.replay(v_actor, p_request_id, v_hash);
  if v_result is not null then return private.ok(v_result); end if;

  v_household := private.require_active_household(v_actor);
  v_task := private.load_task(v_household, p_task_id);
  if v_task.version <> p_expected_version then
    perform private.fail('CONFLICT', 'error.conflict', v_task.version);
  end if;
  if v_task.assignee_id is not null then
    perform private.fail('ALREADY_ASSIGNED', 'error.already_assigned', v_task.version);
  end if;
  if v_task.completed then
    perform private.fail('CONFLICT', 'error.conflict', v_task.version);
  end if;
  perform private.require_assignable(v_household, v_actor);

  begin
    update public.tasks t
    set assignee_id = v_actor, updated_at = now(), version = t.version + 1
    where t.id = p_task_id returning * into v_task;
    v_result := private.task_dto(v_task);
    perform private.record_receipt(
      v_actor, v_household, p_request_id, 'claim_task', v_hash, v_result);
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'command_receipts_actor_request_unique' then raise; end if;
    v_result := private.replay(v_actor, p_request_id, v_hash);
    if v_result is null then perform private.fail('CONFLICT'); end if;
  end;
  return private.ok(v_result);
end;
$$;
