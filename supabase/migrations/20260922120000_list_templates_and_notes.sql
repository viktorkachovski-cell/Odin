-- List templates and list notes (docs/23-LIST-TEMPLATES-AND-LIST-NOTES.md).
--
-- Additive: lists gain a shared note, an active list can be saved as a list
-- template together with every task inside it, and the legacy create_list /
-- update_list RPCs stay callable and note-preserving for installed clients.

alter table public.lists add column notes text;

alter table public.lists add constraint lists_notes_normalized check (
  notes is null
  or (notes = private.normalized_text(notes) and char_length(notes) <= 5000)
);

-- Templates were previously only the ones create_household copies out of
-- private.seed_lists, so every template carried a seed_key. Member-saved
-- templates have no seed content behind them. The unique (household_id,
-- seed_key) index is unaffected: Postgres does not treat null as a duplicate.
alter table public.lists drop constraint lists_template_seed_key;

create or replace function private.create_list_v2(
  p_request_id uuid,
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
  where id = p_list_id and household_id = v_household and kind = 'active' and status = 'open'
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

create or replace function private.save_list_template(p_request_id uuid, p_list_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function private.copy_template(p_request_id uuid, p_template_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.create_list_v2(
  request_id uuid, title text, subtitle text default null, notes text default null
) returns jsonb language sql security invoker set search_path = ''
as $$ select private.create_list_v2(request_id, title, subtitle, notes); $$;

create or replace function public.update_list_v2(
  request_id uuid, list_id uuid, expected_version bigint, title text,
  subtitle text default null, notes text default null
) returns jsonb language sql security invoker set search_path = ''
as $$ select private.update_list_v2(request_id, list_id, expected_version, title, subtitle, notes); $$;

create or replace function public.save_list_template(request_id uuid, list_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.save_list_template(request_id, list_id); $$;

revoke all on function private.create_list_v2(uuid, text, text, text) from public, anon;
revoke all on function private.update_list_v2(uuid, uuid, bigint, text, text, text) from public, anon;
revoke all on function private.save_list_template(uuid, uuid) from public, anon;
revoke all on function public.create_list_v2(uuid, text, text, text) from public, anon;
revoke all on function public.update_list_v2(uuid, uuid, bigint, text, text, text) from public, anon;
revoke all on function public.save_list_template(uuid, uuid) from public, anon;

grant execute on function private.create_list_v2(uuid, text, text, text) to authenticated;
grant execute on function private.update_list_v2(uuid, uuid, bigint, text, text, text) to authenticated;
grant execute on function private.save_list_template(uuid, uuid) to authenticated;
grant execute on function public.create_list_v2(uuid, text, text, text) to authenticated;
grant execute on function public.update_list_v2(uuid, uuid, bigint, text, text, text) to authenticated;
grant execute on function public.save_list_template(uuid, uuid) to authenticated;

-- get_home now projects the list note alongside the subtitle.

create or replace function public.get_home(p_cursor text default null, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_household uuid := private.active_household_id();
  v_cursor jsonb := private.decode_cursor(p_cursor);
  v_after uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 50);
  v_items jsonb;
  v_last uuid;
begin
  if auth.uid() is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if v_household is null then return private.error_response('NOT_FOUND', 'error.household_required'); end if;
  if p_cursor is not null and v_cursor is null then
    return private.error_response('VALIDATION', 'error.cursor_invalid');
  end if;
  v_after := nullif(v_cursor ->> 'id', '')::uuid;

  with page as (
    select l.id, l.kind, l.title, l.subtitle, l.notes, l.status, l.version,
      count(t.id)::integer as total_tasks,
      count(t.id) filter (where t.completed)::integer as completed_tasks
    from public.lists l
    left join public.tasks t on t.list_id = l.id
    where l.household_id = v_household and l.status = 'open'
      and (v_after is null or l.id > v_after)
    group by l.id
    order by l.id
    limit v_limit + 1
  ), visible as (
    select * from page order by id limit v_limit
  )
  select
    coalesce(jsonb_agg(to_jsonb(visible) order by id), '[]'::jsonb),
    (select id from visible order by id desc limit 1)
  into v_items, v_last
  from visible;

  return private.ok_response(jsonb_build_object(
    'items', v_items,
    'next_cursor', case when (
      select count(*) > v_limit from public.lists
      where household_id = v_household and status = 'open'
        and (v_after is null or id > v_after)
    ) then private.encode_cursor(jsonb_build_object('id', v_last)) else null end
  ));
end;
$$;
