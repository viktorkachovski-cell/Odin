-- Deletion is exposed as an idempotent, actor-scoped command. Lists are
-- archived through their existing status column so their task history remains
-- recoverable by an operator; tasks are removed because they have no archive
-- state. Both operations require the current version and household membership.

CREATE OR REPLACE FUNCTION private.delete_list (
  p_request_id       uuid,
  p_list_id          uuid,
  p_expected_version bigint
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid := auth.uid();
  v_household uuid;
  v_list public.lists%rowtype;
  v_hash bytea;
  v_replay jsonb;
  v_response jsonb;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null or p_list_id is null or p_expected_version is null or p_expected_version < 1 then
    return private.error_response('VALIDATION', 'error.command_invalid');
  end if;
  v_household := private.active_household_id(v_actor);
  if v_household is null then return private.error_response('FORBIDDEN', 'error.household_required'); end if;
  perform private.lock_command(v_actor, p_request_id);
  if not private.lock_active_members(v_household, array[v_actor]) then
    return private.error_response('FORBIDDEN', 'error.household_required');
  end if;
  v_hash := private.command_hash(jsonb_build_object(
    'list_id', p_list_id, 'expected_version', p_expected_version
  ));
  v_replay := private.replay_command(v_actor, p_request_id, 'delete_list', v_hash);
  if v_replay is not null then return v_replay; end if;

  select * into v_list from public.lists
  where id = p_list_id and household_id = v_household and kind = 'active' and status = 'open'
  for update;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  if v_list.version <> p_expected_version then
    return private.error_response('CONFLICT', 'error.conflict', v_list.version);
  end if;

  update public.lists set status = 'archived' where id = p_list_id;
  v_response := private.ok_response(jsonb_build_object('list_id', p_list_id));
  perform private.save_command(v_actor, p_request_id, v_household, 'delete_list', v_hash, v_response);
  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION private.delete_task (
  p_request_id       uuid,
  p_task_id          uuid,
  p_expected_version bigint
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid := auth.uid();
  v_household uuid;
  v_task public.tasks%rowtype;
  v_hash bytea;
  v_replay jsonb;
  v_response jsonb;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null or p_task_id is null or p_expected_version is null or p_expected_version < 1 then
    return private.error_response('VALIDATION', 'error.command_invalid');
  end if;
  v_household := private.active_household_id(v_actor);
  if v_household is null then return private.error_response('FORBIDDEN', 'error.household_required'); end if;
  perform private.lock_command(v_actor, p_request_id);
  if not private.lock_active_members(v_household, array[v_actor]) then
    return private.error_response('FORBIDDEN', 'error.household_required');
  end if;
  v_hash := private.command_hash(jsonb_build_object(
    'task_id', p_task_id, 'expected_version', p_expected_version
  ));
  v_replay := private.replay_command(v_actor, p_request_id, 'delete_task', v_hash);
  if v_replay is not null then return v_replay; end if;

  select t.* into v_task from public.tasks t
  join public.lists l on l.id = t.list_id and l.household_id = t.household_id
  where t.id = p_task_id and t.household_id = v_household
    and l.kind = 'active' and l.status = 'open'
  for update of t;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  if v_task.version <> p_expected_version then
    return private.error_response('CONFLICT', 'error.conflict', v_task.version);
  end if;

  delete from public.tasks where id = p_task_id;
  v_response := private.ok_response(jsonb_build_object('task_id', p_task_id));
  perform private.save_command(v_actor, p_request_id, v_household, 'delete_task', v_hash, v_response);
  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_list (
  request_id uuid, list_id uuid, expected_version bigint
)
  RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO ''
  AS $function$ select private.delete_list(request_id, list_id, expected_version); $function$;

CREATE OR REPLACE FUNCTION public.delete_task (
  request_id uuid, task_id uuid, expected_version bigint
)
  RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path TO ''
  AS $function$ select private.delete_task(request_id, task_id, expected_version); $function$;

REVOKE ALL ON FUNCTION public.delete_list(uuid, uuid, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_task(uuid, uuid, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_list(uuid, uuid, bigint) TO authenticated, postgres;
GRANT EXECUTE ON FUNCTION public.delete_task(uuid, uuid, bigint) TO authenticated, postgres;
