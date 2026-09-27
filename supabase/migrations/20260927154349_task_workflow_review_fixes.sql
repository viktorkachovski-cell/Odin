SET local check_function_bodies = off;

DROP FUNCTION "private"."get_all_tasks"(timestamp WITH time zone, timestamp WITH time zone, boolean, boolean, text, integer);

DROP FUNCTION "private"."get_home_v2"(text, integer);

DROP FUNCTION "private"."set_task_status"(uuid, uuid, bigint, text);

DROP FUNCTION "public"."get_all_tasks"(timestamp WITH time zone, timestamp WITH time zone, boolean, boolean, text, integer);

DROP FUNCTION "public"."get_home_v2"(text, integer);

DROP FUNCTION "public"."set_task_status"(uuid, uuid, bigint, text);

CREATE OR REPLACE FUNCTION private.claim_task (
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
  v_hash bytea;
  v_replay jsonb;
  v_task public.tasks%rowtype;
  v_response jsonb;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null or p_expected_version is null or p_expected_version < 1 then
    return private.error_response('VALIDATION', 'error.command_invalid');
  end if;
  v_household := private.active_household_id(v_actor);
  if v_household is null then return private.error_response('FORBIDDEN', 'error.household_required'); end if;
  perform private.lock_command(v_actor, p_request_id);
  v_hash := private.command_hash(jsonb_build_object(
    'task_id', p_task_id, 'expected_version', p_expected_version
  ));
  v_replay := private.replay_command(v_actor, p_request_id, 'claim_task', v_hash);
  if v_replay is not null then return v_replay; end if;

  if not private.lock_active_members(v_household, array[v_actor]) then
    return private.error_response('FORBIDDEN', 'error.household_required');
  end if;

  select t.* into v_task from public.tasks t
  join public.lists l on l.id = t.list_id and l.household_id = t.household_id
  where t.id = p_task_id and t.household_id = v_household
    and l.kind = 'active' and l.status = 'open'
  for update of t;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  if v_task.version <> p_expected_version then
    return private.error_response('CONFLICT', 'error.conflict', v_task.version);
  end if;
  if v_task.completed then return private.error_response('CONFLICT', 'error.task_completed', v_task.version); end if;
  if v_task.assignee_id is not null then
    return private.error_response('ALREADY_ASSIGNED', 'error.already_assigned', v_task.version);
  end if;

  update public.tasks set assignee_id = v_actor
  where id = p_task_id returning * into v_task;
  v_response := private.ok_response(to_jsonb(v_task));
  perform private.save_command(v_actor, p_request_id, v_household, 'claim_task', v_hash, v_response);
  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION private.collection_limit()
  RETURNS integer
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$ select 1000; $function$;

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

  -- Removing a task changes its neighbours' order, so it serialises with moves.
  if private.lock_task_list(v_household, p_task_id, true) is null then
    return private.error_response('NOT_FOUND', 'error.not_found');
  end if;
  select * into v_task from public.tasks where id = p_task_id for update;
  if v_task.version <> p_expected_version then
    return private.error_response('CONFLICT', 'error.conflict', v_task.version);
  end if;

  delete from public.tasks where id = p_task_id;
  v_response := private.ok_response(jsonb_build_object('task_id', p_task_id));
  perform private.save_command(v_actor, p_request_id, v_household, 'delete_task', v_hash, v_response);
  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION private.get_home_v2()
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_household uuid := private.active_household_id();
  v_count integer;
  v_items jsonb;
begin
  if auth.uid() is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if v_household is null then return private.error_response('NOT_FOUND', 'error.household_required'); end if;

  -- Templates first, then active lists, each in shared household order.
  with summaries as (
    select l.id, l.kind, l.title, l.subtitle, l.notes, l.status, l.sort_order, l.version,
      count(t.id)::integer as total_tasks,
      count(t.id) filter (where t.completed)::integer as completed_tasks
    from public.lists l
    left join public.tasks t on t.list_id = l.id
    where l.household_id = v_household and l.status = 'open'
    group by l.id
    order by l.kind = 'active', l.sort_order, l.id
    limit private.collection_limit() + 1
  )
  select count(*)::integer,
    coalesce(jsonb_agg(to_jsonb(s) order by s.kind = 'active', s.sort_order, s.id), '[]'::jsonb)
  into v_count, v_items
  from summaries s;

  if v_count > private.collection_limit() then
    return private.error_response('TOO_LARGE', 'error.too_large');
  end if;
  return private.ok_response(jsonb_build_object('items', v_items));
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

  -- Deadline ascending with undated last, then list and task id: the order
  -- compareTasksByDue reproduces on the client.
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
    order by t.due_at nulls last, t.list_id, t.id
    limit private.collection_limit() + 1
  )
  select count(*)::integer,
    coalesce(jsonb_agg(to_jsonb(m) order by m.due_at nulls last, m.list_id, m.id), '[]'::jsonb)
  into v_count, v_items
  from matches m;

  if v_count > private.collection_limit() then
    return private.error_response('TOO_LARGE', 'error.too_large');
  end if;
  return private.ok_response(jsonb_build_object('items', v_items));
end;
$function$;

CREATE OR REPLACE FUNCTION private.get_list_v2 (
  p_list_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_household uuid := private.active_household_id();
  v_list jsonb;
  v_count integer;
  v_done integer;
  v_tasks jsonb;
begin
  if auth.uid() is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if v_household is null then return private.error_response('NOT_FOUND', 'error.household_required'); end if;

  select to_jsonb(l) into v_list from public.lists l
  where l.id = p_list_id and l.household_id = v_household and l.status = 'open';
  if v_list is null then return private.error_response('NOT_FOUND', 'error.not_found'); end if;

  -- Incomplete first, each group in its declared order.
  with list_tasks as (
    select t.* from public.tasks t
    where t.list_id = p_list_id
    order by t.completed, t.sort_order, t.id
    limit private.collection_limit() + 1
  )
  select count(*)::integer, (count(*) filter (where lt.completed))::integer,
    coalesce(jsonb_agg(to_jsonb(lt) order by lt.completed, lt.sort_order, lt.id), '[]'::jsonb)
  into v_count, v_done, v_tasks
  from list_tasks lt;

  if v_count > private.collection_limit() then
    return private.error_response('TOO_LARGE', 'error.too_large');
  end if;
  return private.ok_response(jsonb_build_object(
    'list', v_list,
    'total_tasks', v_count,
    'completed_tasks', v_done,
    'progress_percent', case when v_count = 0 then 0 else round(v_done * 100.0 / v_count)::integer end,
    'tasks', v_tasks
  ));
end;
$function$;

CREATE OR REPLACE FUNCTION private.lock_task_list (
  p_household_id uuid,
  p_task_id      uuid,
  p_active_only  boolean
)
  RETURNS uuid
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select l.id
  from public.tasks t
  join public.lists l on l.id = t.list_id and l.household_id = t.household_id
  where t.id = p_task_id and t.household_id = p_household_id and l.status = 'open'
    and (not p_active_only or l.kind = 'active')
  for update of l;
$function$;

CREATE OR REPLACE FUNCTION private.move_list (
  p_request_id       uuid,
  p_list_id          uuid,
  p_expected_version bigint,
  p_direction        text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid := auth.uid();
  v_household uuid;
  v_hash bytea;
  v_replay jsonb;
  v_list public.lists%rowtype;
  v_neighbor public.lists%rowtype;
  v_response jsonb;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null or p_list_id is null or p_expected_version is null or p_expected_version < 1
    or p_direction is null or p_direction not in ('up', 'down') then
    return private.error_response('VALIDATION', 'error.command_invalid');
  end if;
  v_household := private.active_household_id(v_actor);
  if v_household is null then return private.error_response('FORBIDDEN', 'error.household_required'); end if;
  perform private.lock_command(v_actor, p_request_id);
  v_hash := private.command_hash(jsonb_build_object(
    'list_id', p_list_id, 'expected_version', p_expected_version, 'direction', p_direction
  ));
  v_replay := private.replay_command(v_actor, p_request_id, 'move_list', v_hash);
  if v_replay is not null then return v_replay; end if;

  if not private.lock_active_members(v_household, array[v_actor]) then
    return private.error_response('FORBIDDEN', 'error.household_required');
  end if;
  -- The household ordering lock serialises every change to list positions
  -- (moves and new lists); it is always taken before any list row lock.
  perform private.lock_list_ordering(v_household);

  select * into v_list from public.lists
  where id = p_list_id and household_id = v_household and status = 'open'
  for update;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  if v_list.version <> p_expected_version then
    return private.error_response('CONFLICT', 'error.conflict', v_list.version);
  end if;

  if p_direction = 'up' then
    select * into v_neighbor from public.lists
    where household_id = v_household and kind = v_list.kind and status = 'open'
      and sort_order < v_list.sort_order
    order by sort_order desc limit 1
    for update;
  else
    select * into v_neighbor from public.lists
    where household_id = v_household and kind = v_list.kind and status = 'open'
      and sort_order > v_list.sort_order
    order by sort_order limit 1
    for update;
  end if;

  if found then
    set constraints public.lists_household_kind_sort_order_key deferred;
    update public.lists
    set sort_order = case id when v_list.id then v_neighbor.sort_order else v_list.sort_order end
    where id in (v_list.id, v_neighbor.id);
    set constraints public.lists_household_kind_sort_order_key immediate;
  end if;

  v_response := private.ok_response(jsonb_build_object('list_id', p_list_id));
  perform private.save_command(v_actor, p_request_id, v_household, 'move_list', v_hash, v_response);
  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION private.move_task (
  p_request_id       uuid,
  p_task_id          uuid,
  p_expected_version bigint,
  p_direction        text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid := auth.uid();
  v_household uuid;
  v_list_id uuid;
  v_hash bytea;
  v_replay jsonb;
  v_task public.tasks%rowtype;
  v_neighbor public.tasks%rowtype;
  v_response jsonb;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null or p_task_id is null or p_expected_version is null or p_expected_version < 1
    or p_direction is null or p_direction not in ('up', 'down') then
    return private.error_response('VALIDATION', 'error.command_invalid');
  end if;
  v_household := private.active_household_id(v_actor);
  if v_household is null then return private.error_response('FORBIDDEN', 'error.household_required'); end if;
  perform private.lock_command(v_actor, p_request_id);
  v_hash := private.command_hash(jsonb_build_object(
    'task_id', p_task_id, 'expected_version', p_expected_version, 'direction', p_direction
  ));
  v_replay := private.replay_command(v_actor, p_request_id, 'move_task', v_hash);
  if v_replay is not null then return v_replay; end if;

  if not private.lock_active_members(v_household, array[v_actor]) then
    return private.error_response('FORBIDDEN', 'error.household_required');
  end if;
  -- Template task order can change too, so either list kind qualifies.
  v_list_id := private.lock_task_list(v_household, p_task_id, false);
  if v_list_id is null then return private.error_response('NOT_FOUND', 'error.not_found'); end if;

  select * into v_task from public.tasks where id = p_task_id for update;
  if v_task.version <> p_expected_version then
    return private.error_response('CONFLICT', 'error.conflict', v_task.version);
  end if;

  -- Moves stay inside the task's completion group; with the list locked, the
  -- neighbour found here is the committed one.
  if p_direction = 'up' then
    select * into v_neighbor from public.tasks
    where list_id = v_list_id and completed = v_task.completed and sort_order < v_task.sort_order
    order by sort_order desc limit 1
    for update;
  else
    select * into v_neighbor from public.tasks
    where list_id = v_list_id and completed = v_task.completed and sort_order > v_task.sort_order
    order by sort_order limit 1
    for update;
  end if;

  if found then
    set constraints public.tasks_list_id_sort_order_key deferred;
    update public.tasks
    set sort_order = case id when v_task.id then v_neighbor.sort_order else v_task.sort_order end
    where id in (v_task.id, v_neighbor.id);
    set constraints public.tasks_list_id_sort_order_key immediate;
  end if;

  v_response := private.ok_response(jsonb_build_object('task_id', p_task_id));
  perform private.save_command(v_actor, p_request_id, v_household, 'move_task', v_hash, v_response);
  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION private.set_task_completed (
  p_request_id       uuid,
  p_task_id          uuid,
  p_expected_version bigint,
  p_completed        boolean
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid := auth.uid();
  v_household uuid;
  v_hash bytea;
  v_replay jsonb;
  v_task public.tasks%rowtype;
  v_response jsonb;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null or p_expected_version is null or p_expected_version < 1
    or p_completed is null then
    return private.error_response('VALIDATION', 'error.command_invalid');
  end if;
  v_household := private.active_household_id(v_actor);
  if v_household is null then return private.error_response('FORBIDDEN', 'error.household_required'); end if;
  perform private.lock_command(v_actor, p_request_id);
  v_hash := private.command_hash(jsonb_build_object(
    'task_id', p_task_id, 'expected_version', p_expected_version, 'completed', p_completed
  ));
  v_replay := private.replay_command(v_actor, p_request_id, 'set_task_completed', v_hash);
  if v_replay is not null then return v_replay; end if;

  if not private.lock_active_members(v_household, array[v_actor]) then
    return private.error_response('FORBIDDEN', 'error.household_required');
  end if;
  if private.lock_task_list(v_household, p_task_id, true) is null then
    return private.error_response('NOT_FOUND', 'error.not_found');
  end if;

  select * into v_task from public.tasks where id = p_task_id for update;
  if v_task.version <> p_expected_version then
    return private.error_response('CONFLICT', 'error.conflict', v_task.version);
  end if;

  update public.tasks set completed = p_completed, blocked = false
  where id = p_task_id returning * into v_task;
  v_response := private.ok_response(to_jsonb(v_task));
  perform private.save_command(
    v_actor, p_request_id, v_household, 'set_task_completed', v_hash, v_response
  );
  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION private.set_task_state (
  p_request_id       uuid,
  p_task_id          uuid,
  p_expected_version bigint,
  p_state            text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid := auth.uid();
  v_household uuid;
  v_hash bytea;
  v_replay jsonb;
  v_task public.tasks%rowtype;
  v_response jsonb;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null or p_task_id is null or p_expected_version is null or p_expected_version < 1
    or p_state is null or p_state not in ('open', 'blocked', 'done') then
    return private.error_response('VALIDATION', 'error.command_invalid');
  end if;
  v_household := private.active_household_id(v_actor);
  if v_household is null then return private.error_response('FORBIDDEN', 'error.household_required'); end if;
  perform private.lock_command(v_actor, p_request_id);
  v_hash := private.command_hash(jsonb_build_object(
    'task_id', p_task_id, 'expected_version', p_expected_version, 'state', p_state
  ));
  v_replay := private.replay_command(v_actor, p_request_id, 'set_task_state', v_hash);
  if v_replay is not null then return v_replay; end if;

  if not private.lock_active_members(v_household, array[v_actor]) then
    return private.error_response('FORBIDDEN', 'error.household_required');
  end if;
  if private.lock_task_list(v_household, p_task_id, true) is null then
    return private.error_response('NOT_FOUND', 'error.not_found');
  end if;

  select * into v_task from public.tasks where id = p_task_id for update;
  if v_task.version <> p_expected_version then
    return private.error_response('CONFLICT', 'error.conflict', v_task.version);
  end if;

  update public.tasks
  set completed = (p_state = 'done'), blocked = (p_state = 'blocked')
  where id = p_task_id returning * into v_task;
  v_response := private.ok_response(to_jsonb(v_task));
  perform private.save_command(v_actor, p_request_id, v_household, 'set_task_state', v_hash, v_response);
  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_all_tasks (
  p_due_from        timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_due_before      timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_undated         boolean                  DEFAULT false,
  p_incomplete_only boolean                  DEFAULT false
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select private.get_household_tasks('all', p_due_from, p_due_before, p_undated, p_incomplete_only);
$function$;

CREATE OR REPLACE FUNCTION public.get_home_v2()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$ select private.get_home_v2(); $function$;

CREATE OR REPLACE FUNCTION public.get_list_v2 (
  p_list_id uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$ select private.get_list_v2(p_list_id); $function$;

CREATE OR REPLACE FUNCTION public.get_my_tasks_v2()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$ select private.get_household_tasks('mine', null, null, false, true); $function$;

CREATE OR REPLACE FUNCTION public.get_unassigned_v2()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$ select private.get_household_tasks('unassigned', null, null, false, true); $function$;

CREATE OR REPLACE FUNCTION public.set_task_state (
  request_id       uuid,
  task_id          uuid,
  expected_version bigint,
  state            text
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.set_task_state(request_id, task_id, expected_version, state); $function$;

REVOKE ALL ON FUNCTION "private"."collection_limit"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."collection_limit"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."get_home_v2"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."get_home_v2"() TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."get_household_tasks"(text, timestamp WITH time zone, timestamp WITH time zone, boolean, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."get_household_tasks"(text, timestamp WITH time zone, timestamp WITH time zone, boolean, boolean) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."get_list_v2"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."get_list_v2"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."lock_task_list"(uuid, uuid, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."lock_task_list"(uuid, uuid, boolean) TO "postgres";

REVOKE ALL ON FUNCTION "private"."set_task_state"(uuid, uuid, bigint, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."set_task_state"(uuid, uuid, bigint, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."get_all_tasks"(timestamp WITH time zone, timestamp WITH time zone, boolean, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_all_tasks"(timestamp WITH time zone, timestamp WITH time zone, boolean, boolean) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."get_home_v2"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_home_v2"() TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."get_list_v2"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_list_v2"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."get_my_tasks_v2"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_my_tasks_v2"() TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."get_unassigned_v2"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_unassigned_v2"() TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."set_task_state"(uuid, uuid, bigint, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."set_task_state"(uuid, uuid, bigint, text) TO "authenticated", "postgres";
