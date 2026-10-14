-- Editable list templates (owner request 2026-10-14).
--
-- A list template can now be renamed, have its note edited, and have tasks
-- added, edited and deleted, through the same commands active lists use.
-- Template tasks still carry text and order only: an assignee or a deadline on
-- a template task returns VALIDATION (error.template_task_runtime), and the
-- validate_task_parent_and_assignee trigger keeps enforcing the same rule.
-- Completion, blocking, claiming and Delete done stay active-list only.
--
-- Only function bodies change; signatures, grants and payloads are unchanged,
-- so CREATE OR REPLACE keeps every existing grant and revoke.

create or replace function private.update_list(
  p_request_id uuid,
  p_list_id uuid,
  p_expected_version bigint,
  p_title text,
  p_subtitle text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  if p_request_id is null or p_expected_version is null or p_expected_version < 1 then
    return private.error_response('VALIDATION', 'error.command_invalid');
  end if;
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
  v_hash := private.command_hash(jsonb_build_object(
    'list_id', p_list_id, 'expected_version', p_expected_version,
    'title', v_title, 'subtitle', v_subtitle
  ));
  v_replay := private.replay_command(v_actor, p_request_id, 'update_list', v_hash);
  if v_replay is not null then return v_replay; end if;

  select * into v_list from public.lists
  where id = p_list_id and household_id = v_household and status = 'open'
  for update;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  if v_list.version <> p_expected_version then
    return private.error_response('CONFLICT', 'error.conflict', v_list.version);
  end if;

  update public.lists set title = v_title, subtitle = v_subtitle
  where id = p_list_id returning * into v_list;
  v_response := private.ok_response(to_jsonb(v_list));
  perform private.save_command(v_actor, p_request_id, v_household, 'update_list', v_hash, v_response);
  return v_response;
end;
$$;

create or replace function private.update_list_v2(
  p_request_id uuid,
  p_list_id uuid,
  p_expected_version bigint,
  p_title text,
  p_subtitle text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
  if p_request_id is null or p_expected_version is null or p_expected_version < 1 then
    return private.error_response('VALIDATION', 'error.command_invalid');
  end if;
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
  v_hash := private.command_hash(jsonb_build_object(
    'list_id', p_list_id, 'expected_version', p_expected_version,
    'title', v_title, 'subtitle', v_subtitle, 'notes', v_notes
  ));
  v_replay := private.replay_command(v_actor, p_request_id, 'update_list_v2', v_hash);
  if v_replay is not null then return v_replay; end if;

  select * into v_list from public.lists
  where id = p_list_id and household_id = v_household and status = 'open'
  for update;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  if v_list.version <> p_expected_version then
    return private.error_response('CONFLICT', 'error.conflict', v_list.version);
  end if;

  update public.lists set title = v_title, subtitle = v_subtitle, notes = v_notes
  where id = p_list_id returning * into v_list;
  v_response := private.ok_response(to_jsonb(v_list));
  perform private.save_command(v_actor, p_request_id, v_household, 'update_list_v2', v_hash, v_response);
  return v_response;
end;
$$;

create or replace function private.create_task(
  p_request_id uuid,
  p_list_id uuid,
  p_title text,
  p_assignee_id uuid default null,
  p_due_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_household uuid;
  v_title text := private.normalized_text(p_title);
  v_hash bytea;
  v_replay jsonb;
  v_task public.tasks%rowtype;
  v_order integer;
  v_kind text;
  v_response jsonb;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null then return private.error_response('VALIDATION', 'error.request_id_required'); end if;
  v_household := private.active_household_id(v_actor);
  if v_household is null then return private.error_response('FORBIDDEN', 'error.household_required'); end if;
  if v_title is null or char_length(v_title) > 160 then
    return private.error_response('VALIDATION', 'error.task_invalid');
  end if;
  perform private.lock_command(v_actor, p_request_id);
  v_hash := private.command_hash(jsonb_build_object(
    'list_id', p_list_id, 'title', v_title,
    'assignee_id', p_assignee_id, 'due_at', p_due_at
  ));
  v_replay := private.replay_command(v_actor, p_request_id, 'create_task', v_hash);
  if v_replay is not null then return v_replay; end if;

  if not private.lock_active_members(
    v_household, array_remove(array[v_actor, p_assignee_id], null)
  ) then
    return private.error_response('VALIDATION', 'error.assignee_invalid');
  end if;

  select kind into v_kind from public.lists
  where id = p_list_id and household_id = v_household and status = 'open'
  for update;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  -- A template task carries text and order only; the tasks trigger enforces
  -- the same rule, this turns it into an answer instead of an exception.
  if v_kind = 'template' and (p_assignee_id is not null or p_due_at is not null) then
    return private.error_response('VALIDATION', 'error.template_task_runtime');
  end if;
  if p_assignee_id is not null and not private.is_active_member(v_household, p_assignee_id) then
    return private.error_response('VALIDATION', 'error.assignee_invalid');
  end if;
  select coalesce(max(sort_order), -1) + 1 into v_order
  from public.tasks where list_id = p_list_id;

  insert into public.tasks (household_id, list_id, title, sort_order, assignee_id, due_at)
  values (v_household, p_list_id, v_title, v_order, p_assignee_id, p_due_at)
  returning * into v_task;
  v_response := private.ok_response(to_jsonb(v_task));
  perform private.save_command(v_actor, p_request_id, v_household, 'create_task', v_hash, v_response);
  return v_response;
end;
$$;

create or replace function private.create_task_v2(
  p_request_id uuid,
  p_list_id uuid,
  p_title text,
  p_assignee_id uuid default null,
  p_due_at timestamptz default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_household uuid;
  v_title text := private.normalized_text(p_title);
  v_notes text := private.normalized_text(p_notes);
  v_hash bytea;
  v_replay jsonb;
  v_task public.tasks%rowtype;
  v_order integer;
  v_kind text;
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
  select kind into v_kind from public.lists
  where id = p_list_id and household_id = v_household and status = 'open'
  for update;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  -- A template task carries text and order only; the tasks trigger enforces
  -- the same rule, this turns it into an answer instead of an exception.
  if v_kind = 'template' and (p_assignee_id is not null or p_due_at is not null) then
    return private.error_response('VALIDATION', 'error.template_task_runtime');
  end if;
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
$$;

create or replace function private.update_task(
  p_request_id uuid,
  p_task_id uuid,
  p_expected_version bigint,
  p_title text,
  p_assignee_id uuid default null,
  p_due_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_household uuid;
  v_title text := private.normalized_text(p_title);
  v_hash bytea;
  v_replay jsonb;
  v_task public.tasks%rowtype;
  v_response jsonb;
  v_kind text;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null or p_expected_version is null or p_expected_version < 1 then
    return private.error_response('VALIDATION', 'error.command_invalid');
  end if;
  v_household := private.active_household_id(v_actor);
  if v_household is null then return private.error_response('FORBIDDEN', 'error.household_required'); end if;
  if v_title is null or char_length(v_title) > 160 then
    return private.error_response('VALIDATION', 'error.task_invalid');
  end if;
  perform private.lock_command(v_actor, p_request_id);
  v_hash := private.command_hash(jsonb_build_object(
    'task_id', p_task_id, 'expected_version', p_expected_version, 'title', v_title,
    'assignee_id', p_assignee_id, 'due_at', p_due_at
  ));
  v_replay := private.replay_command(v_actor, p_request_id, 'update_task', v_hash);
  if v_replay is not null then return v_replay; end if;

  if not private.lock_active_members(
    v_household, array_remove(array[v_actor, p_assignee_id], null)
  ) then
    return private.error_response('VALIDATION', 'error.assignee_invalid');
  end if;

  select t.* into v_task from public.tasks t
  join public.lists l on l.id = t.list_id and l.household_id = t.household_id
  where t.id = p_task_id and t.household_id = v_household and l.status = 'open'
  for update of t;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  if v_task.version <> p_expected_version then
    return private.error_response('CONFLICT', 'error.conflict', v_task.version);
  end if;
  select kind into v_kind from public.lists where id = v_task.list_id;
  if v_kind = 'template' and (p_assignee_id is not null or p_due_at is not null) then
    return private.error_response('VALIDATION', 'error.template_task_runtime');
  end if;
  if p_assignee_id is not null and not private.is_active_member(v_household, p_assignee_id) then
    return private.error_response('VALIDATION', 'error.assignee_invalid');
  end if;

  update public.tasks set title = v_title, assignee_id = p_assignee_id, due_at = p_due_at
  where id = p_task_id returning * into v_task;
  v_response := private.ok_response(to_jsonb(v_task));
  perform private.save_command(v_actor, p_request_id, v_household, 'update_task', v_hash, v_response);
  return v_response;
end;
$$;

create or replace function private.update_task_v2(
  p_request_id uuid,
  p_task_id uuid,
  p_expected_version bigint,
  p_title text,
  p_assignee_id uuid default null,
  p_due_at timestamptz default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_household uuid;
  v_title text := private.normalized_text(p_title);
  v_notes text := private.normalized_text(p_notes);
  v_hash bytea;
  v_replay jsonb;
  v_task public.tasks%rowtype;
  v_response jsonb;
  v_kind text;
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
  where t.id = p_task_id and t.household_id = v_household and l.status = 'open'
  for update of t;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  if v_task.version <> p_expected_version then
    return private.error_response('CONFLICT', 'error.conflict', v_task.version);
  end if;
  select kind into v_kind from public.lists where id = v_task.list_id;
  if v_kind = 'template' and (p_assignee_id is not null or p_due_at is not null) then
    return private.error_response('VALIDATION', 'error.template_task_runtime');
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
$$;

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
  -- Either list kind: a template's tasks are edited like any other list's.
  if private.lock_task_list(v_household, p_task_id, false) is null then
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
