alter table public.tasks add column notes text;

alter table public.tasks drop constraint tasks_title_normalized;
alter table public.tasks add constraint tasks_title_normalized check (
  title = private.normalized_text(title) and char_length(title) between 1 and 500
);
alter table public.tasks add constraint tasks_notes_normalized check (
  notes is null or (notes = private.normalized_text(notes) and char_length(notes) <= 5000)
);

create table public.task_templates (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint task_templates_title_normalized check (
    title = private.normalized_text(title) and char_length(title) between 1 and 500
  ),
  constraint task_templates_notes_normalized check (
    notes is null or (notes = private.normalized_text(notes) and char_length(notes) <= 5000)
  )
);
create index task_templates_household_created_idx
on public.task_templates (household_id, created_at desc, id desc);
alter table public.task_templates enable row level security;
revoke all on public.task_templates from public, anon, authenticated;

create or replace function private.create_task_v2(
  p_request_id uuid, p_list_id uuid, p_title text, p_assignee_id uuid default null,
  p_due_at timestamptz default null, p_notes text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid(); v_household uuid;
  v_title text := private.normalized_text(p_title);
  v_notes text := private.normalized_text(p_notes);
  v_hash bytea; v_replay jsonb; v_task public.tasks%rowtype;
  v_order integer; v_response jsonb;
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
  if not private.lock_active_members(v_household, array_remove(array[v_actor, p_assignee_id], null)) then
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
$$;

create or replace function private.update_task_v2(
  p_request_id uuid, p_task_id uuid, p_expected_version bigint, p_title text,
  p_assignee_id uuid default null, p_due_at timestamptz default null, p_notes text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid(); v_household uuid;
  v_title text := private.normalized_text(p_title);
  v_notes text := private.normalized_text(p_notes);
  v_hash bytea; v_replay jsonb; v_task public.tasks%rowtype; v_response jsonb;
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
  if not private.lock_active_members(v_household, array_remove(array[v_actor, p_assignee_id], null)) then
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
$$;

create or replace function private.save_task_template(
  p_request_id uuid, p_title text, p_notes text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid(); v_household uuid;
  v_title text := private.normalized_text(p_title);
  v_notes text := private.normalized_text(p_notes);
  v_hash bytea; v_replay jsonb; v_template public.task_templates%rowtype; v_response jsonb;
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
  values (v_household, v_title, v_notes, v_actor) returning * into v_template;
  v_response := private.ok_response(jsonb_build_object(
    'id', v_template.id, 'title', v_template.title, 'notes', v_template.notes
  ));
  perform private.save_command(v_actor, p_request_id, v_household, 'save_task_template', v_hash, v_response);
  return v_response;
end;
$$;

create or replace function private.get_task_templates()
returns jsonb language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is null then private.error_response('UNAUTHENTICATED', 'error.unauthenticated')
    when private.active_household_id() is null then private.error_response('NOT_FOUND', 'error.household_required')
    else private.ok_response(jsonb_build_object(
      'items', coalesce((
        select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'notes', notes)
          order by created_at desc, id desc)
        from (
          select id, title, notes, created_at from public.task_templates
          where household_id = private.active_household_id()
          order by created_at desc, id desc limit 50
        ) templates
      ), '[]'::jsonb), 'next_cursor', null
    ))
  end;
$$;

create or replace function public.create_task_v2(
  request_id uuid, list_id uuid, title text, assignee_id uuid default null,
  due_at timestamptz default null, notes text default null
)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.create_task_v2(request_id, list_id, title, assignee_id, due_at, notes); $$;
create or replace function public.update_task_v2(
  request_id uuid, task_id uuid, expected_version bigint, title text,
  assignee_id uuid default null, due_at timestamptz default null, notes text default null
)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.update_task_v2(request_id, task_id, expected_version, title, assignee_id, due_at, notes); $$;
create or replace function public.save_task_template(request_id uuid, title text, notes text default null)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.save_task_template(request_id, title, notes); $$;
create or replace function public.get_task_templates()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.get_task_templates(); $$;

revoke all on function private.create_task_v2(uuid, uuid, text, uuid, timestamptz, text) from public, anon;
revoke all on function private.update_task_v2(uuid, uuid, bigint, text, uuid, timestamptz, text) from public, anon;
revoke all on function private.save_task_template(uuid, text, text) from public, anon;
revoke all on function private.get_task_templates() from public, anon;
revoke all on function public.create_task_v2(uuid, uuid, text, uuid, timestamptz, text) from public, anon;
revoke all on function public.update_task_v2(uuid, uuid, bigint, text, uuid, timestamptz, text) from public, anon;
revoke all on function public.save_task_template(uuid, text, text) from public, anon;
revoke all on function public.get_task_templates() from public, anon;

grant execute on function private.create_task_v2(uuid, uuid, text, uuid, timestamptz, text) to authenticated;
grant execute on function private.update_task_v2(uuid, uuid, bigint, text, uuid, timestamptz, text) to authenticated;
grant execute on function private.save_task_template(uuid, text, text) to authenticated;
grant execute on function private.get_task_templates() to authenticated;
grant execute on function public.create_task_v2(uuid, uuid, text, uuid, timestamptz, text) to authenticated;
grant execute on function public.update_task_v2(uuid, uuid, bigint, text, uuid, timestamptz, text) to authenticated;
grant execute on function public.save_task_template(uuid, text, text) to authenticated;
grant execute on function public.get_task_templates() to authenticated;

create or replace function private.copy_template(p_request_id uuid, p_template_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid(); v_household uuid; v_hash bytea; v_replay jsonb;
  v_source public.lists%rowtype; v_list_id uuid; v_response jsonb;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null then return private.error_response('VALIDATION', 'error.request_id_required'); end if;
  v_household := private.active_household_id(v_actor);
  if v_household is null then return private.error_response('FORBIDDEN', 'error.household_required'); end if;
  perform private.lock_command(v_actor, p_request_id);
  if not private.lock_active_members(v_household, array[v_actor]) then
    return private.error_response('FORBIDDEN', 'error.household_required');
  end if;
  v_hash := private.command_hash(jsonb_build_object('template_id', p_template_id));
  v_replay := private.replay_command(v_actor, p_request_id, 'copy_template', v_hash);
  if v_replay is not null then return v_replay; end if;
  select * into v_source from public.lists
  where id = p_template_id and household_id = v_household and kind = 'template' and status = 'open'
  for share;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  insert into public.lists (household_id, kind, title, subtitle, created_by)
  values (v_household, 'active', v_source.title, v_source.subtitle, v_actor)
  returning id into v_list_id;
  insert into public.tasks (household_id, list_id, title, sort_order, notes)
  select v_household, v_list_id, title, sort_order, notes from public.tasks
  where list_id = p_template_id order by sort_order, id;
  v_response := private.ok_response(jsonb_build_object('list_id', v_list_id));
  perform private.save_command(v_actor, p_request_id, v_household, 'copy_template', v_hash, v_response);
  return v_response;
end;
$$;
