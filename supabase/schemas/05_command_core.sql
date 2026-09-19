-- Shared command machinery: typed responses, idempotency receipts, validation.
-- Errors are raised with SQLSTATE 'OD001' so the surrounding transaction rolls back
-- (no partial writes, no consumed request ID) while the public wrapper still returns
-- the contract's discriminated-union shape.

create or replace function private.ok(p_data jsonb)
returns jsonb language sql immutable set search_path = ''
as $$ select jsonb_build_object('ok', true, 'data', p_data) $$;

create or replace function private.err(
  p_code text, p_message_key text default null, p_current_version bigint default null
) returns jsonb language sql immutable set search_path = ''
as $$
  select jsonb_build_object('ok', false, 'error', jsonb_strip_nulls(jsonb_build_object(
    'code', p_code,
    'message_key', coalesce(p_message_key, 'error.' || lower(p_code)),
    'current_version', p_current_version
  )));
$$;

create or replace function private.fail(
  p_code text, p_message_key text default null, p_current_version bigint default null
) returns void language plpgsql set search_path = ''
as $$
begin
  raise exception using
    errcode = 'OD001',
    message = p_code,
    detail = private.err(p_code, p_message_key, p_current_version)::text;
end;
$$;

create or replace function private.require_actor()
returns uuid language plpgsql stable set search_path = ''
as $$
declare v_actor uuid;
begin
  v_actor := (select auth.uid());
  if v_actor is null then perform private.fail('UNAUTHENTICATED'); end if;
  return v_actor;
end;
$$;

create or replace function private.require_active_household(p_actor uuid)
returns uuid language plpgsql stable security definer set search_path = ''
as $$
declare v_household uuid;
begin
  select m.household_id into v_household from public.memberships m
  where m.user_id = p_actor and m.status = 'active';
  if v_household is null then perform private.fail('FORBIDDEN'); end if;
  return v_household;
end;
$$;

create or replace function private.norm_text(p_text text)
returns text language sql immutable set search_path = ''
as $$ select nullif(btrim(coalesce(p_text, '')), '') $$;

-- Validation failures name a safe field, never SQL text or user content.
create or replace function private.require_text(
  p_value text, p_field text, p_min integer, p_max integer, p_required boolean
) returns text language plpgsql set search_path = ''
as $$
declare v_value text := private.norm_text(p_value);
begin
  if v_value is null then
    if p_required then perform private.fail('VALIDATION', 'validation.' || p_field || '.required'); end if;
    return null;
  end if;
  if char_length(v_value) < p_min or char_length(v_value) > p_max then
    perform private.fail('VALIDATION', 'validation.' || p_field || '.length');
  end if;
  return v_value;
end;
$$;

create or replace function private.payload_hash(p_command text, p_payload jsonb)
returns text language sql immutable set search_path = ''
as $$
  -- jsonb normalises key order and whitespace, so its text form is canonical.
  select encode(extensions.digest(p_command || ':' || p_payload::text, 'sha256'), 'hex');
$$;

-- Returns a committed result for this request ID, or null when the command is new.
-- Authorization is rechecked so a receipt cannot leak a household the caller has left.
create or replace function private.replay(p_actor uuid, p_request_id uuid, p_hash text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_receipt private.command_receipts;
begin
  select * into v_receipt from private.command_receipts r
  where r.actor_id = p_actor and r.request_id = p_request_id;
  if not found then return null; end if;
  if v_receipt.payload_hash <> p_hash then perform private.fail('IDEMPOTENCY_MISMATCH'); end if;
  if v_receipt.household_id is not null
     and not private.is_active_member(v_receipt.household_id) then
    perform private.fail('FORBIDDEN');
  end if;
  return v_receipt.result;
end;
$$;

create or replace function private.record_receipt(
  p_actor uuid, p_household uuid, p_request_id uuid, p_command text,
  p_hash text, p_result jsonb
) returns void language sql security definer set search_path = ''
as $$
  insert into private.command_receipts
    (actor_id, household_id, request_id, command, payload_hash, result)
  values (p_actor, p_household, p_request_id, p_command, p_hash, p_result);
$$;

-- Server-clock rate limiting in a server-controlled store.
create or replace function private.check_rate(
  p_actor uuid, p_kind text, p_limit integer, p_window interval
) returns void language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
  select count(*) into v_count from private.rate_events e
  where e.actor_id = p_actor and e.kind = p_kind and e.created_at > now() - p_window;
  if v_count >= p_limit then perform private.fail('RATE_LIMITED'); end if;
  insert into private.rate_events (actor_id, kind) values (p_actor, p_kind);
end;
$$;

create or replace function private.list_dto(p_list public.lists)
returns jsonb language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_list.id, 'household_id', p_list.household_id, 'kind', p_list.kind,
    'title', p_list.title, 'subtitle', p_list.subtitle, 'status', p_list.status,
    'seed_key', p_list.seed_key, 'created_by', p_list.created_by,
    'created_at', p_list.created_at, 'updated_at', p_list.updated_at,
    'version', p_list.version
  );
$$;

create or replace function private.task_dto(p_task public.tasks)
returns jsonb language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_task.id, 'household_id', p_task.household_id, 'list_id', p_task.list_id,
    'title', p_task.title, 'sort_order', p_task.sort_order, 'completed', p_task.completed,
    'assignee_id', p_task.assignee_id, 'due_at', p_task.due_at,
    'created_by', p_task.created_by, 'created_at', p_task.created_at,
    'updated_at', p_task.updated_at, 'version', p_task.version
  );
$$;
