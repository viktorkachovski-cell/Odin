SET local check_function_bodies = off;

REVOKE ALL ON TABLE "public"."households" FROM "anon";

REVOKE ALL ON TABLE "public"."lists" FROM "anon";

REVOKE ALL ON TABLE "public"."memberships" FROM "anon";

REVOKE ALL ON TABLE "public"."profiles" FROM "anon";

REVOKE ALL ON TABLE "public"."tasks" FROM "anon";

ALTER TABLE "public"."tasks"
  DROP CONSTRAINT "tasks_list_id_sort_order_key";

ALTER TABLE "public"."lists"
  ADD COLUMN "sort_order" integer NOT NULL DEFAULT 0;

-- Existing households may have several lists of the same kind. Give those
-- lists stable positions before enforcing uniqueness for future moves.
WITH ordered AS (
  SELECT id, row_number() OVER (
    PARTITION BY household_id, kind ORDER BY created_at, id
  ) - 1 AS position
  FROM public.lists
)
UPDATE public.lists AS list
SET sort_order = ordered.position
FROM ordered
WHERE list.id = ordered.id;

ALTER TABLE "public"."tasks"
  ADD COLUMN "blocked" boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION private.assign_list_order()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform private.lock_list_ordering(new.household_id);
  select coalesce(max(sort_order), -1) + 1 into new.sort_order
  from public.lists
  where household_id = new.household_id and kind = new.kind;
  return new;
end;
$function$;

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
  v_list_id uuid;
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

  select l.id into v_list_id
  from public.tasks t
  join public.lists l on l.id = t.list_id and l.household_id = t.household_id
  where t.id = p_task_id and t.household_id = v_household
    and l.kind = 'active' and l.status = 'open';
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  perform 1 from public.lists where id = v_list_id and household_id = v_household for update;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;

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

CREATE OR REPLACE FUNCTION private.copy_template (
  p_request_id  uuid,
  p_template_id uuid
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
  v_source public.lists%rowtype;
  v_list_id uuid;
  v_response jsonb;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null then return private.error_response('VALIDATION', 'error.request_id_required'); end if;
  v_household := private.active_household_id(v_actor);
  if v_household is null then return private.error_response('FORBIDDEN', 'error.household_required'); end if;
  perform private.lock_command(v_actor, p_request_id);
  if not private.lock_active_members(v_household, array[v_actor]) then
    return private.error_response('FORBIDDEN', 'error.household_required');
  end if;
  perform private.lock_list_ordering(v_household);
  v_hash := private.command_hash(jsonb_build_object('template_id', p_template_id));
  v_replay := private.replay_command(v_actor, p_request_id, 'copy_template', v_hash);
  if v_replay is not null then return v_replay; end if;

  select * into v_source from public.lists
  where id = p_template_id and household_id = v_household and kind = 'template' and status = 'open'
  for share;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;

  insert into public.lists (household_id, kind, title, subtitle, notes, created_by)
  values (v_household, 'active', v_source.title, v_source.subtitle, v_source.notes, v_actor)
  returning id into v_list_id;

  insert into public.tasks (household_id, list_id, title, sort_order, notes)
  select v_household, v_list_id, title, sort_order, notes
  from public.tasks
  where list_id = p_template_id
  order by sort_order, id;

  v_response := private.ok_response(jsonb_build_object('list_id', v_list_id));
  perform private.save_command(v_actor, p_request_id, v_household, 'copy_template', v_hash, v_response);
  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION private.create_list (
  p_request_id uuid,
  p_title      text,
  p_subtitle   text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid := auth.uid();
  v_household uuid;
  v_title text := private.normalized_text(p_title);
  v_subtitle text := private.normalized_text(p_subtitle);
  v_hash bytea;
  v_replay jsonb;
  v_list public.lists%rowtype;
  v_response jsonb;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null then return private.error_response('VALIDATION', 'error.request_id_required'); end if;
  v_household := private.active_household_id(v_actor);
  if v_household is null then return private.error_response('FORBIDDEN', 'error.household_required'); end if;
  if v_title is null or char_length(v_title) > 160
    or (v_subtitle is not null and char_length(v_subtitle) > 300) then
    return private.error_response('VALIDATION', 'error.list_invalid');
  end if;

  perform private.lock_command(v_actor, p_request_id);
  if not private.lock_active_members(v_household, array[v_actor]) then
    return private.error_response('FORBIDDEN', 'error.household_required');
  end if;
  perform private.lock_list_ordering(v_household);
  v_hash := private.command_hash(jsonb_build_object('title', v_title, 'subtitle', v_subtitle));
  v_replay := private.replay_command(v_actor, p_request_id, 'create_list', v_hash);
  if v_replay is not null then return v_replay; end if;

  insert into public.lists (household_id, kind, title, subtitle, created_by)
  values (v_household, 'active', v_title, v_subtitle, v_actor)
  returning * into v_list;

  v_response := private.ok_response(to_jsonb(v_list));
  perform private.save_command(v_actor, p_request_id, v_household, 'create_list', v_hash, v_response);
  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION private.create_list_v2 (
  p_request_id uuid,
  p_title      text,
  p_subtitle   text DEFAULT NULL::text,
  p_notes      text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid := auth.uid();
  v_household uuid;
  v_title text := private.normalized_text(p_title);
  v_subtitle text := private.normalized_text(p_subtitle);
  v_notes text := private.normalized_text(p_notes);
  v_hash bytea;
  v_replay jsonb;
  v_list public.lists%rowtype;
  v_response jsonb;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null then return private.error_response('VALIDATION', 'error.request_id_required'); end if;
  v_household := private.active_household_id(v_actor);
  if v_household is null then return private.error_response('FORBIDDEN', 'error.household_required'); end if;
  if v_title is null or char_length(v_title) > 160
    or (v_subtitle is not null and char_length(v_subtitle) > 300)
    or (v_notes is not null and char_length(v_notes) > 5000) then
    return private.error_response('VALIDATION', 'error.list_invalid');
  end if;

  perform private.lock_command(v_actor, p_request_id);
  if not private.lock_active_members(v_household, array[v_actor]) then
    return private.error_response('FORBIDDEN', 'error.household_required');
  end if;
  perform private.lock_list_ordering(v_household);
  v_hash := private.command_hash(jsonb_build_object(
    'title', v_title, 'subtitle', v_subtitle, 'notes', v_notes
  ));
  v_replay := private.replay_command(v_actor, p_request_id, 'create_list_v2', v_hash);
  if v_replay is not null then return v_replay; end if;

  insert into public.lists (household_id, kind, title, subtitle, notes, created_by)
  values (v_household, 'active', v_title, v_subtitle, v_notes, v_actor)
  returning * into v_list;

  v_response := private.ok_response(to_jsonb(v_list));
  perform private.save_command(v_actor, p_request_id, v_household, 'create_list_v2', v_hash, v_response);
  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION private.create_task_v2 (
  p_request_id  uuid,
  p_list_id     uuid,
  p_title       text,
  p_assignee_id uuid                     DEFAULT NULL::uuid,
  p_due_at      timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_notes       text                     DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid := auth.uid();
  v_household uuid;
  v_title text := private.normalized_text(p_title);
  v_notes text := private.normalized_text(p_notes);
  v_hash bytea;
  v_replay jsonb;
  v_task public.tasks%rowtype;
  v_order integer;
  v_response jsonb;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null then return private.error_response('VALIDATION', 'error.request_id_required'); end if;
  v_household := private.active_household_id(v_actor);
  if v_household is null then return private.error_response('FORBIDDEN', 'error.household_required'); end if;
  if v_title is null or char_length(v_title) > 500 or char_length(v_notes) > 5000 then
    return private.error_response('VALIDATION', 'error.task_invalid');
  end if;
  perform private.lock_command(v_actor, p_request_id);
  v_hash := private.command_hash(jsonb_build_object(
    'list_id', p_list_id, 'title', v_title, 'notes', v_notes,
    'assignee_id', p_assignee_id, 'due_at', p_due_at
  ));
  v_replay := private.replay_command(v_actor, p_request_id, 'create_task_v2', v_hash);
  if v_replay is not null then return v_replay; end if;

  if not private.lock_active_members(
    v_household, array_remove(array[v_actor, p_assignee_id], null)
  ) then
    return private.error_response('VALIDATION', 'error.assignee_invalid');
  end if;
  perform 1 from public.lists
  where id = p_list_id and household_id = v_household and kind = 'active' and status = 'open'
  for update;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  if p_assignee_id is not null and not private.is_active_member(v_household, p_assignee_id) then
    return private.error_response('VALIDATION', 'error.assignee_invalid');
  end if;
  select coalesce(max(sort_order), -1) + 1 into v_order from public.tasks where list_id = p_list_id;

  insert into public.tasks (household_id, list_id, title, sort_order, assignee_id, due_at, notes)
  values (v_household, p_list_id, v_title, v_order, p_assignee_id, p_due_at, v_notes)
  returning * into v_task;
  v_response := private.ok_response(to_jsonb(v_task));
  perform private.save_command(v_actor, p_request_id, v_household, 'create_task_v2', v_hash, v_response);
  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION private.get_all_tasks (
  p_due_from        timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_due_before      timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_undated         boolean                  DEFAULT false,
  p_incomplete_only boolean                  DEFAULT false,
  p_cursor          text                     DEFAULT NULL::text,
  p_limit           integer                  DEFAULT 50
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
  v_cursor jsonb := private.decode_cursor(p_cursor);
  v_has_due boolean;
  v_due timestamptz;
  v_list_id uuid;
  v_task_id uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 50);
  v_items jsonb;
  v_last record;
  v_more boolean;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if v_household is null then return private.error_response('NOT_FOUND', 'error.household_required'); end if;
  if p_undated is null or p_incomplete_only is null
    or (p_due_from is not null and p_due_before is not null and p_due_from >= p_due_before)
    or (p_undated and (p_due_from is not null or p_due_before is not null)) then
    return private.error_response('VALIDATION', 'error.task_filter_invalid');
  end if;
  if p_cursor is not null and v_cursor is null then
    return private.error_response('VALIDATION', 'error.cursor_invalid');
  end if;
  if v_cursor is not null then
    begin
      v_has_due := (v_cursor ->> 'has_due')::boolean;
      v_due := (v_cursor ->> 'sort_due')::timestamptz;
      v_list_id := (v_cursor ->> 'list_id')::uuid;
      v_task_id := (v_cursor ->> 'task_id')::uuid;
      if v_has_due is null or v_due is null or v_list_id is null or v_task_id is null
        or v_cursor -> 'due_from' is distinct from coalesce(to_jsonb(p_due_from), 'null'::jsonb)
        or v_cursor -> 'due_before' is distinct from coalesce(to_jsonb(p_due_before), 'null'::jsonb)
        or v_cursor -> 'undated' is distinct from to_jsonb(p_undated)
        or v_cursor -> 'incomplete_only' is distinct from to_jsonb(p_incomplete_only) then
        return private.error_response('VALIDATION', 'error.cursor_invalid');
      end if;
    exception when others then
      return private.error_response('VALIDATION', 'error.cursor_invalid');
    end;
  end if;

  with candidates as (
    select t.id as task_id, t.due_at, t.list_id,
      (t.due_at is null) as has_no_due,
      coalesce(t.due_at, 'infinity'::timestamptz) as sort_due
    from public.tasks t
    join public.lists l on l.id = t.list_id and l.household_id = t.household_id
    where t.household_id = v_household and l.kind = 'active' and l.status = 'open'
      and (not p_incomplete_only or not t.completed)
      and (
        (p_undated and t.due_at is null)
        or (not p_undated and (
          (p_due_from is null and p_due_before is null)
          or (t.due_at is not null
            and (p_due_from is null or t.due_at >= p_due_from)
            and (p_due_before is null or t.due_at < p_due_before))
        ))
      )
  ), page as (
    select c.* from candidates c
    where v_cursor is null or
      (c.has_no_due, c.sort_due, c.list_id, c.task_id) >
      (not v_has_due, v_due, v_list_id, v_task_id)
    order by has_no_due, sort_due, list_id, task_id
    limit v_limit + 1
  ), visible as (
    select p.* from page p order by has_no_due, sort_due, list_id, task_id limit v_limit
  )
  select coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object('list_title', l.title)
    order by v.has_no_due, v.sort_due, v.list_id, v.task_id), '[]'::jsonb)
  into v_items
  from visible v
  join public.tasks t on t.id = v.task_id
  join public.lists l on l.id = v.list_id and l.household_id = t.household_id;

  with candidates as (
    select t.id as task_id, t.due_at, t.list_id,
      (t.due_at is null) as has_no_due,
      coalesce(t.due_at, 'infinity'::timestamptz) as sort_due
    from public.tasks t
    join public.lists l on l.id = t.list_id and l.household_id = t.household_id
    where t.household_id = v_household and l.kind = 'active' and l.status = 'open'
      and (not p_incomplete_only or not t.completed)
      and ((p_undated and t.due_at is null) or (not p_undated and (
        (p_due_from is null and p_due_before is null)
        or (t.due_at is not null and (p_due_from is null or t.due_at >= p_due_from)
          and (p_due_before is null or t.due_at < p_due_before))))
  )
  select * into v_last from candidates c
  where v_cursor is null or
    (c.has_no_due, c.sort_due, c.list_id, c.task_id) >
    (not v_has_due, v_due, v_list_id, v_task_id)
  order by has_no_due, sort_due, list_id, task_id
  offset greatest(v_limit - 1, 0) limit 1;

  with candidates as (
    select t.id as task_id, t.due_at, t.list_id,
      (t.due_at is null) as has_no_due,
      coalesce(t.due_at, 'infinity'::timestamptz) as sort_due
    from public.tasks t
    join public.lists l on l.id = t.list_id and l.household_id = t.household_id
    where t.household_id = v_household and l.kind = 'active' and l.status = 'open'
      and (not p_incomplete_only or not t.completed)
      and ((p_undated and t.due_at is null) or (not p_undated and (
        (p_due_from is null and p_due_before is null)
        or (t.due_at is not null and (p_due_from is null or t.due_at >= p_due_from)
          and (p_due_before is null or t.due_at < p_due_before))))
  )
  select count(*) > v_limit into v_more
  from (
    select 1 from candidates c
    where v_cursor is null or
      (c.has_no_due, c.sort_due, c.list_id, c.task_id) >
      (not v_has_due, v_due, v_list_id, v_task_id)
    limit v_limit + 1
  ) candidate_page;

  return private.ok_response(jsonb_build_object(
    'items', v_items,
    'next_cursor', case when v_more then private.encode_cursor(jsonb_build_object(
      'has_due', not v_last.has_no_due,
      'sort_due', v_last.sort_due,
      'list_id', v_last.list_id,
      'task_id', v_last.task_id,
      'due_from', p_due_from,
      'due_before', p_due_before,
      'undated', p_undated,
      'incomplete_only', p_incomplete_only
    )) else null end
  ));
end;
$function$;

CREATE OR REPLACE FUNCTION private.get_cross_list_tasks (
  mode     text,
  p_cursor text    DEFAULT NULL::text,
  p_limit  integer DEFAULT 50
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
  v_cursor jsonb := private.decode_cursor(p_cursor);
  v_due timestamptz;
  v_has_due boolean;
  v_list_id uuid;
  v_task_id uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 50);
  v_items jsonb;
  v_last record;
  v_more boolean;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if v_household is null then return private.error_response('NOT_FOUND', 'error.household_required'); end if;
  if mode not in ('mine', 'unassigned') then
    return private.error_response('VALIDATION', 'error.mode_invalid');
  end if;
  if p_cursor is not null and v_cursor is null then
    return private.error_response('VALIDATION', 'error.cursor_invalid');
  end if;
  if v_cursor is not null then
    v_has_due := (v_cursor ->> 'has_due')::boolean;
    v_due := (v_cursor ->> 'sort_due')::timestamptz;
    v_list_id := (v_cursor ->> 'list_id')::uuid;
    v_task_id := (v_cursor ->> 'task_id')::uuid;
  end if;

  with candidates as (
    select t.id as task_id, t.title, t.due_at, t.version, t.list_id, t.blocked,
      l.title as list_title, (t.due_at is null) as has_no_due,
      coalesce(t.due_at, 'infinity'::timestamptz) as sort_due
    from public.tasks t
    join public.lists l on l.id = t.list_id and l.household_id = t.household_id
    where t.household_id = v_household and not t.completed
      and l.kind = 'active' and l.status = 'open'
      and ((mode = 'mine' and t.assignee_id = v_actor)
        or (mode = 'unassigned' and t.assignee_id is null))
  ), page as (
    select * from candidates c
    where v_cursor is null or
      (c.has_no_due, c.sort_due, c.list_id, c.task_id) >
      (not v_has_due, v_due, v_list_id, v_task_id)
    order by has_no_due, sort_due, list_id, task_id
    limit v_limit + 1
  ), visible as (
    select * from page order by has_no_due, sort_due, list_id, task_id limit v_limit
  )
  select coalesce(jsonb_agg(to_jsonb(visible) - 'sort_due' order by has_no_due, sort_due, list_id, task_id), '[]'::jsonb)
  into v_items from visible;

  with candidates as (
    select t.id as task_id, t.due_at, t.list_id, (t.due_at is null) as has_no_due,
      coalesce(t.due_at, 'infinity'::timestamptz) as sort_due
    from public.tasks t
    join public.lists l on l.id = t.list_id and l.household_id = t.household_id
    where t.household_id = v_household and not t.completed
      and l.kind = 'active' and l.status = 'open'
      and ((mode = 'mine' and t.assignee_id = v_actor)
        or (mode = 'unassigned' and t.assignee_id is null))
  )
  select * into v_last from candidates c
  where v_cursor is null or
    (c.has_no_due, c.sort_due, c.list_id, c.task_id) >
    (not v_has_due, v_due, v_list_id, v_task_id)
  order by has_no_due, sort_due, list_id, task_id offset greatest(v_limit - 1, 0) limit 1;

  with candidates as (
    select t.id as task_id, t.due_at, t.list_id, (t.due_at is null) as has_no_due,
      coalesce(t.due_at, 'infinity'::timestamptz) as sort_due
    from public.tasks t
    join public.lists l on l.id = t.list_id and l.household_id = t.household_id
    where t.household_id = v_household and not t.completed
      and l.kind = 'active' and l.status = 'open'
      and ((mode = 'mine' and t.assignee_id = v_actor)
        or (mode = 'unassigned' and t.assignee_id is null))
  )
  select exists (
    select 1 from candidates c
    where v_cursor is null or
      (c.has_no_due, c.sort_due, c.list_id, c.task_id) >
      (not v_has_due, v_due, v_list_id, v_task_id)
    offset v_limit limit 1
  ) into v_more;

  return private.ok_response(jsonb_build_object(
    'items', v_items,
    'next_cursor', case when v_more then private.encode_cursor(jsonb_build_object(
      'has_due', not v_last.has_no_due,
      'sort_due', v_last.sort_due,
      'list_id', v_last.list_id,
      'task_id', v_last.task_id
    )) else null end
  ));
end;
$function$;

CREATE OR REPLACE FUNCTION private.get_home_v2 (
  p_cursor text    DEFAULT NULL::text,
  p_limit  integer DEFAULT 50
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_household uuid := private.active_household_id();
  v_cursor jsonb := private.decode_cursor(p_cursor);
  v_kind_order integer;
  v_sort_order integer;
  v_id uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 50);
  v_items jsonb;
  v_last record;
  v_more boolean;
begin
  if auth.uid() is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if v_household is null then return private.error_response('NOT_FOUND', 'error.household_required'); end if;
  if p_cursor is not null and v_cursor is null then
    return private.error_response('VALIDATION', 'error.cursor_invalid');
  end if;
  if v_cursor is not null then
    begin
      v_kind_order := (v_cursor ->> 'kind_order')::integer;
      v_sort_order := (v_cursor ->> 'sort_order')::integer;
      v_id := (v_cursor ->> 'id')::uuid;
      if v_kind_order is null or v_kind_order not in (0, 1)
        or v_sort_order is null or v_sort_order < 0 or v_id is null then
        return private.error_response('VALIDATION', 'error.cursor_invalid');
      end if;
    exception when others then
      return private.error_response('VALIDATION', 'error.cursor_invalid');
    end;
  end if;

  with candidates as (
    select l.id, l.kind, l.title, l.subtitle, l.notes, l.status, l.sort_order, l.version,
      case when l.kind = 'template' then 0 else 1 end as kind_order,
      count(t.id)::integer as total_tasks,
      count(t.id) filter (where t.completed)::integer as completed_tasks
    from public.lists l
    left join public.tasks t on t.list_id = l.id
    where l.household_id = v_household and l.status = 'open'
      and (v_cursor is null or
        (case when l.kind = 'template' then 0 else 1 end, l.sort_order, l.id) >
        (v_kind_order, v_sort_order, v_id))
    group by l.id
  ), page as (
    select * from candidates
    order by kind_order, sort_order, id
    limit v_limit + 1
  ), visible as (
    select * from page order by kind_order, sort_order, id limit v_limit
  )
  select coalesce(jsonb_agg(to_jsonb(visible) - 'kind_order' order by kind_order, sort_order, id), '[]'::jsonb)
  into v_items from visible;

  with candidates as (
    select l.id, l.sort_order, case when l.kind = 'template' then 0 else 1 end as kind_order
    from public.lists l
    where l.household_id = v_household and l.status = 'open'
      and (v_cursor is null or
        (case when l.kind = 'template' then 0 else 1 end, l.sort_order, l.id) >
        (v_kind_order, v_sort_order, v_id))
  )
  select * into v_last from candidates order by kind_order, sort_order, id
    offset greatest(v_limit - 1, 0) limit 1;

  with candidates as (
    select l.id, l.sort_order, case when l.kind = 'template' then 0 else 1 end as kind_order
    from public.lists l
    where l.household_id = v_household and l.status = 'open'
      and (v_cursor is null or
        (case when l.kind = 'template' then 0 else 1 end, l.sort_order, l.id) >
        (v_kind_order, v_sort_order, v_id))
  )
  select exists (select 1 from candidates order by kind_order, sort_order, id offset v_limit limit 1)
  into v_more;

  return private.ok_response(jsonb_build_object(
    'items', v_items,
    'next_cursor', case when v_more then private.encode_cursor(jsonb_build_object(
      'kind_order', v_last.kind_order, 'sort_order', v_last.sort_order, 'id', v_last.id
    )) else null end
  ));
end;
$function$;

CREATE OR REPLACE FUNCTION private.get_task_templates()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select case
    when auth.uid() is null then private.error_response('UNAUTHENTICATED', 'error.unauthenticated')
    when private.active_household_id() is null then private.error_response('NOT_FOUND', 'error.household_required')
    else private.ok_response(jsonb_build_object(
      'items', coalesce((
        select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'notes', notes)
          order by created_at desc, id desc)
        from (
          select id, title, notes, created_at
          from public.task_templates
          where household_id = private.active_household_id()
          order by created_at desc, id desc
          limit 50
        ) templates
      ), '[]'::jsonb),
      'next_cursor', null
    ))
  end;
$function$;

CREATE OR REPLACE FUNCTION private.lock_list_ordering (
  p_household_id uuid
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select pg_advisory_xact_lock(hashtextextended(p_household_id::text, 2));
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
  if not private.lock_active_members(v_household, array[v_actor]) then
    return private.error_response('FORBIDDEN', 'error.household_required');
  end if;
  v_hash := private.command_hash(jsonb_build_object(
    'list_id', p_list_id, 'expected_version', p_expected_version, 'direction', p_direction
  ));
  v_replay := private.replay_command(v_actor, p_request_id, 'move_list', v_hash);
  if v_replay is not null then return v_replay; end if;
  perform private.lock_list_ordering(v_household);

  select * into v_list from public.lists
  where id = p_list_id and household_id = v_household and status = 'open';
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  if v_list.version <> p_expected_version then
    return private.error_response('CONFLICT', 'error.conflict', v_list.version);
  end if;
  if p_direction = 'up' then
    select * into v_neighbor from public.lists
    where household_id = v_household and kind = v_list.kind and status = 'open'
      and sort_order < v_list.sort_order
    order by sort_order desc limit 1;
  else
    select * into v_neighbor from public.lists
    where household_id = v_household and kind = v_list.kind and status = 'open'
      and sort_order > v_list.sort_order
    order by sort_order limit 1;
  end if;
  if not found then
    v_response := private.ok_response(jsonb_build_object('list_id', p_list_id));
    perform private.save_command(v_actor, p_request_id, v_household, 'move_list', v_hash, v_response);
    return v_response;
  end if;

  perform id from public.lists
  where id in (v_list.id, v_neighbor.id)
  order by id
  for update;
  select * into v_list from public.lists where id = p_list_id;
  select * into v_neighbor from public.lists where id = v_neighbor.id;
  set constraints public.lists_household_kind_sort_order_key deferred;
  update public.lists
  set sort_order = case id
    when v_list.id then v_neighbor.sort_order
    else v_list.sort_order
  end
  where id in (v_list.id, v_neighbor.id);
  set constraints public.lists_household_kind_sort_order_key immediate;

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
  if not private.lock_active_members(v_household, array[v_actor]) then
    return private.error_response('FORBIDDEN', 'error.household_required');
  end if;
  v_hash := private.command_hash(jsonb_build_object(
    'task_id', p_task_id, 'expected_version', p_expected_version, 'direction', p_direction
  ));
  v_replay := private.replay_command(v_actor, p_request_id, 'move_task', v_hash);
  if v_replay is not null then return v_replay; end if;

  select t.list_id into v_list_id from public.tasks t
  where t.id = p_task_id and t.household_id = v_household;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  perform 1 from public.lists
  where id = v_list_id and household_id = v_household and status = 'open'
  for update;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  select * into v_task from public.tasks
  where id = p_task_id and household_id = v_household and list_id = v_list_id;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  if v_task.version <> p_expected_version then
    return private.error_response('CONFLICT', 'error.conflict', v_task.version);
  end if;

  if p_direction = 'up' then
    select * into v_neighbor from public.tasks
    where list_id = v_list_id and completed = v_task.completed and sort_order < v_task.sort_order
    order by sort_order desc limit 1;
  else
    select * into v_neighbor from public.tasks
    where list_id = v_list_id and completed = v_task.completed and sort_order > v_task.sort_order
    order by sort_order limit 1;
  end if;
  if not found then
    v_response := private.ok_response(jsonb_build_object('task_id', p_task_id));
    perform private.save_command(v_actor, p_request_id, v_household, 'move_task', v_hash, v_response);
    return v_response;
  end if;

  perform id from public.tasks
  where id in (v_task.id, v_neighbor.id)
  order by id
  for update;
  select * into v_task from public.tasks where id = p_task_id;
  select * into v_neighbor from public.tasks where id = v_neighbor.id;
  set constraints public.tasks_list_id_sort_order_key deferred;
  update public.tasks
  set sort_order = case id
    when v_task.id then v_neighbor.sort_order
    else v_task.sort_order
  end
  where id in (v_task.id, v_neighbor.id);
  set constraints public.tasks_list_id_sort_order_key immediate;

  v_response := private.ok_response(jsonb_build_object('task_id', p_task_id));
  perform private.save_command(v_actor, p_request_id, v_household, 'move_task', v_hash, v_response);
  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION private.save_list_template (
  p_request_id uuid,
  p_list_id    uuid
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
  v_source public.lists%rowtype;
  v_template_id uuid;
  v_response jsonb;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null then return private.error_response('VALIDATION', 'error.request_id_required'); end if;
  v_household := private.active_household_id(v_actor);
  if v_household is null then return private.error_response('FORBIDDEN', 'error.household_required'); end if;
  perform private.lock_command(v_actor, p_request_id);
  if not private.lock_active_members(v_household, array[v_actor]) then
    return private.error_response('FORBIDDEN', 'error.household_required');
  end if;
  perform private.lock_list_ordering(v_household);
  v_hash := private.command_hash(jsonb_build_object('list_id', p_list_id));
  v_replay := private.replay_command(v_actor, p_request_id, 'save_list_template', v_hash);
  if v_replay is not null then return v_replay; end if;

  select * into v_source from public.lists
  where id = p_list_id and household_id = v_household and kind = 'active' and status = 'open'
  for share;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;

  insert into public.lists (household_id, kind, title, subtitle, notes, created_by)
  values (v_household, 'template', v_source.title, v_source.subtitle, v_source.notes, v_actor)
  returning id into v_template_id;

  insert into public.tasks (household_id, list_id, title, sort_order, notes)
  select v_household, v_template_id, title, sort_order, notes
  from public.tasks
  where list_id = p_list_id
  order by sort_order, id;

  v_response := private.ok_response(jsonb_build_object('list_id', v_template_id));
  perform private.save_command(
    v_actor, p_request_id, v_household, 'save_list_template', v_hash, v_response
  );
  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION private.save_task_template (
  p_request_id uuid,
  p_title      text,
  p_notes      text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid := auth.uid();
  v_household uuid;
  v_title text := private.normalized_text(p_title);
  v_notes text := private.normalized_text(p_notes);
  v_hash bytea;
  v_replay jsonb;
  v_template public.task_templates%rowtype;
  v_response jsonb;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null then return private.error_response('VALIDATION', 'error.request_id_required'); end if;
  v_household := private.active_household_id(v_actor);
  if v_household is null then return private.error_response('FORBIDDEN', 'error.household_required'); end if;
  if v_title is null or char_length(v_title) > 500 or char_length(v_notes) > 5000 then
    return private.error_response('VALIDATION', 'error.task_invalid');
  end if;
  perform private.lock_command(v_actor, p_request_id);
  v_hash := private.command_hash(jsonb_build_object('title', v_title, 'notes', v_notes));
  v_replay := private.replay_command(v_actor, p_request_id, 'save_task_template', v_hash);
  if v_replay is not null then return v_replay; end if;
  if not private.lock_active_members(v_household, array[v_actor]) then
    return private.error_response('FORBIDDEN', 'error.household_required');
  end if;

  insert into public.task_templates (household_id, title, notes, created_by)
  values (v_household, v_title, v_notes, v_actor)
  returning * into v_template;
  v_response := private.ok_response(jsonb_build_object(
    'id', v_template.id, 'title', v_template.title, 'notes', v_template.notes
  ));
  perform private.save_command(v_actor, p_request_id, v_household, 'save_task_template', v_hash, v_response);
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
  v_list_id uuid;
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

  select l.id into v_list_id
  from public.tasks t
  join public.lists l on l.id = t.list_id and l.household_id = t.household_id
  where t.id = p_task_id and t.household_id = v_household
    and l.kind = 'active' and l.status = 'open';
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  perform 1 from public.lists where id = v_list_id and household_id = v_household for update;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;

  select t.* into v_task from public.tasks t
  join public.lists l on l.id = t.list_id and l.household_id = t.household_id
  where t.id = p_task_id and t.household_id = v_household
    and l.kind = 'active' and l.status = 'open'
  for update of t;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
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

CREATE OR REPLACE FUNCTION private.set_task_status (
  p_request_id       uuid,
  p_task_id          uuid,
  p_expected_version bigint,
  p_status           text
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
  v_list public.lists%rowtype;
  v_response jsonb;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null or p_task_id is null or p_expected_version is null or p_expected_version < 1
    or p_status is null or p_status not in ('unassigned', 'todo', 'blocked', 'done') then
    return private.error_response('VALIDATION', 'error.command_invalid');
  end if;
  v_household := private.active_household_id(v_actor);
  if v_household is null then return private.error_response('FORBIDDEN', 'error.household_required'); end if;
  perform private.lock_command(v_actor, p_request_id);
  if not private.lock_active_members(v_household, array[v_actor]) then
    return private.error_response('FORBIDDEN', 'error.household_required');
  end if;
  v_hash := private.command_hash(jsonb_build_object(
    'task_id', p_task_id, 'expected_version', p_expected_version, 'status', p_status
  ));
  v_replay := private.replay_command(v_actor, p_request_id, 'set_task_status', v_hash);
  if v_replay is not null then return v_replay; end if;

  select l.* into v_list
  from public.tasks t
  join public.lists l on l.id = t.list_id and l.household_id = t.household_id
  where t.id = p_task_id and t.household_id = v_household and l.kind = 'active' and l.status = 'open';
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  perform 1 from public.lists where id = v_list.id and household_id = v_household for update;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;

  select * into v_task from public.tasks
  where id = p_task_id and household_id = v_household and list_id = v_list.id
  for update;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  if v_task.version <> p_expected_version then
    return private.error_response('CONFLICT', 'error.conflict', v_task.version);
  end if;
  if (p_status = 'unassigned' and v_task.assignee_id is not null)
    or (p_status = 'todo' and v_task.assignee_id is null) then
    return private.error_response('VALIDATION', 'error.task_status_invalid');
  end if;

  update public.tasks
  set completed = (p_status = 'done'), blocked = (p_status = 'blocked')
  where id = p_task_id returning * into v_task;
  v_response := private.ok_response(to_jsonb(v_task));
  perform private.save_command(v_actor, p_request_id, v_household, 'set_task_status', v_hash, v_response);
  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION private.update_task_v2 (
  p_request_id       uuid,
  p_task_id          uuid,
  p_expected_version bigint,
  p_title            text,
  p_assignee_id      uuid                     DEFAULT NULL::uuid,
  p_due_at           timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_notes            text                     DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid := auth.uid();
  v_household uuid;
  v_title text := private.normalized_text(p_title);
  v_notes text := private.normalized_text(p_notes);
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
  if v_title is null or char_length(v_title) > 500 or char_length(v_notes) > 5000 then
    return private.error_response('VALIDATION', 'error.task_invalid');
  end if;
  perform private.lock_command(v_actor, p_request_id);
  v_hash := private.command_hash(jsonb_build_object(
    'task_id', p_task_id, 'expected_version', p_expected_version,
    'title', v_title, 'notes', v_notes, 'assignee_id', p_assignee_id, 'due_at', p_due_at
  ));
  v_replay := private.replay_command(v_actor, p_request_id, 'update_task_v2', v_hash);
  if v_replay is not null then return v_replay; end if;
  if not private.lock_active_members(
    v_household, array_remove(array[v_actor, p_assignee_id], null)
  ) then
    return private.error_response('VALIDATION', 'error.assignee_invalid');
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
  if p_assignee_id is not null and not private.is_active_member(v_household, p_assignee_id) then
    return private.error_response('VALIDATION', 'error.assignee_invalid');
  end if;

  update public.tasks
  set title = v_title, notes = v_notes, assignee_id = p_assignee_id, due_at = p_due_at
  where id = p_task_id returning * into v_task;
  v_response := private.ok_response(to_jsonb(v_task));
  perform private.save_command(v_actor, p_request_id, v_household, 'update_task_v2', v_hash, v_response);
  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION private.validate_task_parent_and_assignee()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  parent_kind text;
  parent_status text;
begin
  select kind, status into parent_kind, parent_status
  from public.lists
  where household_id = new.household_id and id = new.list_id;

  if parent_kind is null then
    raise exception 'task parent list not found' using errcode = '23503';
  end if;

  if parent_kind = 'template'
    and (new.completed or new.blocked or new.assignee_id is not null or new.due_at is not null) then
    raise exception 'template tasks cannot carry runtime state' using errcode = '23514';
  end if;

  if parent_status <> 'open' and tg_op <> 'DELETE' then
    raise exception 'archived lists cannot be changed' using errcode = '23514';
  end if;

  if new.assignee_id is not null and not exists (
    select 1 from public.memberships
    where household_id = new.household_id
      and user_id = new.assignee_id
      and status = 'active'
  ) then
    raise exception 'assignee must be an active household member' using errcode = '23514';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_all_tasks (
  p_due_from        timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_due_before      timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_undated         boolean                  DEFAULT false,
  p_incomplete_only boolean                  DEFAULT false,
  p_cursor          text                     DEFAULT NULL::text,
  p_limit           integer                  DEFAULT 50
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select private.get_all_tasks(p_due_from, p_due_before, p_undated, p_incomplete_only, p_cursor, p_limit);
$function$;

CREATE OR REPLACE FUNCTION public.get_home_v2 (
  p_cursor text    DEFAULT NULL::text,
  p_limit  integer DEFAULT 50
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$ select private.get_home_v2(p_cursor, p_limit); $function$;

CREATE OR REPLACE FUNCTION public.move_list (
  request_id       uuid,
  list_id          uuid,
  expected_version bigint,
  direction        text
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.move_list(request_id, list_id, expected_version, direction); $function$;

CREATE OR REPLACE FUNCTION public.move_task (
  request_id       uuid,
  task_id          uuid,
  expected_version bigint,
  direction        text
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.move_task(request_id, task_id, expected_version, direction); $function$;

CREATE OR REPLACE FUNCTION public.set_task_status (
  request_id       uuid,
  task_id          uuid,
  expected_version bigint,
  status           text
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.set_task_status(request_id, task_id, expected_version, status); $function$;

ALTER TABLE "public"."lists"
  ADD CONSTRAINT "lists_household_kind_sort_order_key" UNIQUE (household_id, kind, sort_order) DEFERRABLE;

ALTER TABLE "public"."lists"
  ADD CONSTRAINT "lists_sort_order_nonnegative" CHECK ((sort_order >= 0));

ALTER TABLE "public"."tasks"
  ADD CONSTRAINT "tasks_completed_blocked_exclusive" CHECK ((NOT (completed AND blocked)));

ALTER TABLE "public"."tasks"
  ADD CONSTRAINT "tasks_list_id_sort_order_key" UNIQUE (list_id, sort_order) DEFERRABLE;

CREATE INDEX tasks_open_household_due_idx ON public.tasks USING btree (household_id, due_at, list_id, id);

CREATE TRIGGER lists_assign_order
  BEFORE INSERT ON public.lists
  FOR EACH ROW
  EXECUTE FUNCTION private.assign_list_order();

REVOKE ALL ON FUNCTION "private"."assign_list_order"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."assign_list_order"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."get_all_tasks"(timestamp WITH time zone, timestamp WITH time zone, boolean, boolean, text, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."get_all_tasks"(timestamp WITH time zone, timestamp WITH time zone, boolean, boolean, text, integer) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."get_home_v2"(text, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."get_home_v2"(text, integer) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."lock_list_ordering"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."lock_list_ordering"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."move_list"(uuid, uuid, bigint, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."move_list"(uuid, uuid, bigint, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."move_task"(uuid, uuid, bigint, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."move_task"(uuid, uuid, bigint, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."set_task_status"(uuid, uuid, bigint, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."set_task_status"(uuid, uuid, bigint, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."get_all_tasks"(timestamp WITH time zone, timestamp WITH time zone, boolean, boolean, text, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_all_tasks"(timestamp WITH time zone, timestamp WITH time zone, boolean, boolean, text, integer) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."get_home_v2"(text, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_home_v2"(text, integer) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."move_list"(uuid, uuid, bigint, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."move_list"(uuid, uuid, bigint, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."move_task"(uuid, uuid, bigint, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."move_task"(uuid, uuid, bigint, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."set_task_status"(uuid, uuid, bigint, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."set_task_status"(uuid, uuid, bigint, text) TO "authenticated", "postgres";
