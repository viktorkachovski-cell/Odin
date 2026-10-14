SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.delete_completed_tasks (
  p_request_id        uuid,
  p_list_id           uuid,
  p_task_ids          uuid[],
  p_expected_versions bigint[]
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid := auth.uid();
  v_household uuid;
  v_count integer := cardinality(p_task_ids);
  v_matched integer;
  v_hash bytea;
  v_replay jsonb;
  v_response jsonb;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null or p_list_id is null or p_expected_versions is null
    or v_count is null or v_count = 0
    or v_count > private.collection_limit()
    or array_ndims(p_task_ids) <> 1 or array_ndims(p_expected_versions) <> 1
    or cardinality(p_expected_versions) <> v_count
    or array_position(p_task_ids, null) is not null
    or exists (select 1 from unnest(p_expected_versions) as v(version) where v.version is null or v.version < 1)
    or (select count(distinct t.id) from unnest(p_task_ids) as t(id)) <> v_count then
    return private.error_response('VALIDATION', 'error.command_invalid');
  end if;
  v_household := private.active_household_id(v_actor);
  if v_household is null then return private.error_response('FORBIDDEN', 'error.household_required'); end if;
  perform private.lock_command(v_actor, p_request_id);
  if not private.lock_active_members(v_household, array[v_actor]) then
    return private.error_response('FORBIDDEN', 'error.household_required');
  end if;
  v_hash := private.command_hash(jsonb_build_object(
    'list_id', p_list_id, 'task_ids', to_jsonb(p_task_ids), 'expected_versions', to_jsonb(p_expected_versions)
  ));
  v_replay := private.replay_command(v_actor, p_request_id, 'delete_completed_tasks', v_hash);
  if v_replay is not null then return v_replay; end if;

  -- Lock order: the parent list, then its task rows by id.
  perform 1 from public.lists
  where id = p_list_id and household_id = v_household and kind = 'active' and status = 'open'
  for update;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  perform 1 from public.tasks where id = any(p_task_ids) and list_id = p_list_id order by id for update;

  select count(*)::integer into v_matched
  from unnest(p_task_ids, p_expected_versions) as e(task_id, version)
  join public.tasks t on t.id = e.task_id
  where t.list_id = p_list_id and t.completed and t.version = e.version;
  if v_matched <> v_count then
    return private.error_response('CONFLICT', 'error.conflict');
  end if;

  delete from public.tasks where id = any(p_task_ids);
  v_response := private.ok_response(jsonb_build_object('list_id', p_list_id, 'deleted', v_count));
  perform private.save_command(v_actor, p_request_id, v_household, 'delete_completed_tasks', v_hash, v_response);
  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION private.get_household_tasks (
  p_scope           text,
  p_due_from        timestamp with time zone,
  p_due_before      timestamp with time zone,
  p_undated         boolean,
  p_incomplete_only boolean
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid := auth.uid();
  v_household uuid := private.active_household_id();
  v_count integer;
  v_items jsonb;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if v_household is null then return private.error_response('NOT_FOUND', 'error.household_required'); end if;
  if p_scope is null or p_scope not in ('all', 'mine', 'unassigned')
    or p_undated is null or p_incomplete_only is null
    or (p_due_from is not null and p_due_before is not null and p_due_from >= p_due_before)
    or (p_undated and (p_due_from is not null or p_due_before is not null)) then
    return private.error_response('VALIDATION', 'error.task_filter_invalid');
  end if;

  -- Deadline ascending with undated last, then oldest created first, then
  -- task id: the order compareTasksByDue reproduces on the client.
  with matches as (
    select t.*, l.title as list_title
    from public.tasks t
    join public.lists l on l.id = t.list_id and l.household_id = t.household_id
    where t.household_id = v_household and l.kind = 'active' and l.status = 'open'
      and (p_scope = 'all'
        or (p_scope = 'mine' and t.assignee_id = v_actor)
        or (p_scope = 'unassigned' and t.assignee_id is null))
      and (not p_incomplete_only or not t.completed)
      and case
        when p_undated then t.due_at is null
        when p_due_from is null and p_due_before is null then true
        else t.due_at is not null
          and (p_due_from is null or t.due_at >= p_due_from)
          and (p_due_before is null or t.due_at < p_due_before)
      end
    order by t.due_at nulls last, t.created_at, t.id
    limit private.collection_limit() + 1
  )
  select count(*)::integer,
    coalesce(jsonb_agg(to_jsonb(m) order by m.due_at nulls last, m.created_at, m.id), '[]'::jsonb)
  into v_count, v_items
  from matches m;

  if v_count > private.collection_limit() then
    return private.error_response('TOO_LARGE', 'error.too_large');
  end if;
  return private.ok_response(jsonb_build_object('items', v_items));
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_completed_tasks (
  request_id        uuid,
  list_id           uuid,
  task_ids          uuid[],
  expected_versions bigint[]
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.delete_completed_tasks(request_id, list_id, task_ids, expected_versions); $function$;

REVOKE ALL ON FUNCTION "public"."delete_completed_tasks"(uuid, uuid, uuid[], bigint[]) FROM PUBLIC, "anon", "service_role";

REVOKE ALL ON FUNCTION "private"."delete_completed_tasks"(uuid, uuid, uuid[], bigint[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."delete_completed_tasks"(uuid, uuid, uuid[], bigint[]) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."delete_completed_tasks"(uuid, uuid, uuid[], bigint[]) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."delete_completed_tasks"(uuid, uuid, uuid[], bigint[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."delete_completed_tasks"(uuid, uuid, uuid[], bigint[]) TO "postgres";

-- Reviewed addition: hosted default privileges have granted new functions to
-- anon before, so close the private helper explicitly as well.
REVOKE ALL ON FUNCTION "private"."delete_completed_tasks"(uuid, uuid, uuid[], bigint[]) FROM "anon";
