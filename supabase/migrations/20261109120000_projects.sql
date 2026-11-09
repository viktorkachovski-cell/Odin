-- Projects: a named group of a household's active lists (owner request
-- 2026-11-09, docs/decisions.md). A project has only a name. Lists point at it
-- through the new nullable lists.project_id; deleting a project ungroups its
-- lists and never deletes or archives one.
--
-- Additive for installed clients: no existing RPC signature, grant, error code
-- or payload field is removed. New: projects, lists.project_id,
-- create_project, update_project, delete_project, create_list_v3,
-- set_list_project, get_projects. Two existing functions are replaced in place
-- with the same signature: get_home_v2 gains a project_id on each list, and
-- move_list swaps a list with its neighbour inside the same project. With no
-- project in use (every project_id null) both behave exactly as before.
-- See docs/contract.md for the compatibility note and release order.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint projects_name_normalized check (
    name = private.normalized_text(name)
    and char_length(name) between 1 and 160
  ),
  constraint projects_version_positive check (version > 0),
  unique (household_id, id)
);

create index projects_household_name_idx
on public.projects (household_id, lower(name), id);

create index projects_created_by_idx on public.projects (created_by);

create trigger projects_touch_version
before update on public.projects
for each row execute function private.touch_versioned_row();

alter table public.projects enable row level security;

create policy projects_select_household
on public.projects for select to authenticated
using ((select private.is_active_member(household_id)));

-- Hosted default privileges would otherwise grant the new table to the API
-- roles. Clients read projects through RLS (realtime) and write only through
-- the project commands.
revoke all on public.projects from public, anon, authenticated;
grant select on public.projects to authenticated;

-- Existing lists keep a null project_id, so nothing about them changes. The
-- constraints are cheap to validate: the column is new and entirely null.
alter table public.lists
  add column project_id uuid,
  add constraint lists_project_active_only check (project_id is null or kind = 'active'),
  add constraint lists_project_fk foreign key (household_id, project_id)
    references public.projects (household_id, id) on delete set null (project_id);

create index lists_project_idx
on public.lists (household_id, project_id)
where project_id is not null;

-- Replaced in place (same signature): shows each list's project.
create or replace function private.get_home_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.active_household_id();
  v_count integer;
  v_items jsonb;
begin
  if auth.uid() is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if v_household is null then return private.error_response('NOT_FOUND', 'error.household_required'); end if;

  -- Templates first, then active lists, each in shared household order.
  with summaries as (
    select l.id, l.kind, l.title, l.subtitle, l.notes, l.status, l.sort_order, l.project_id, l.version,
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
$$;

-- Replaced in place (same signature): a list swaps with its neighbour in the
-- same project, or among the ungrouped lists.
create or replace function private.move_list(
  p_request_id uuid,
  p_list_id uuid,
  p_expected_version bigint,
  p_direction text
)
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

  -- A list swaps with its neighbour inside the same project, or among the
  -- ungrouped lists, so a move is always visible where the member sees it.
  if p_direction = 'up' then
    select * into v_neighbor from public.lists
    where household_id = v_household and kind = v_list.kind and status = 'open'
      and project_id is not distinct from v_list.project_id
      and sort_order < v_list.sort_order
    order by sort_order desc limit 1
    for update;
  else
    select * into v_neighbor from public.lists
    where household_id = v_household and kind = v_list.kind and status = 'open'
      and project_id is not distinct from v_list.project_id
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
$$;

create or replace function private.create_project(p_request_id uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_household uuid;
  v_name text := private.normalized_text(p_name);
  v_hash bytea;
  v_replay jsonb;
  v_project public.projects%rowtype;
  v_response jsonb;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null then return private.error_response('VALIDATION', 'error.request_id_required'); end if;
  v_household := private.active_household_id(v_actor);
  if v_household is null then return private.error_response('FORBIDDEN', 'error.household_required'); end if;
  if v_name is null or char_length(v_name) > 160 then
    return private.error_response('VALIDATION', 'error.project_invalid');
  end if;

  perform private.lock_command(v_actor, p_request_id);
  if not private.lock_active_members(v_household, array[v_actor]) then
    return private.error_response('FORBIDDEN', 'error.household_required');
  end if;
  -- Serialises creation so the ceiling below cannot be overshot.
  perform private.lock_list_ordering(v_household);
  v_hash := private.command_hash(jsonb_build_object('name', v_name));
  v_replay := private.replay_command(v_actor, p_request_id, 'create_project', v_hash);
  if v_replay is not null then return v_replay; end if;

  -- get_projects answers TOO_LARGE above this many, so never create past it.
  if (select count(*) from public.projects where household_id = v_household)
    >= private.collection_limit() then
    return private.error_response('TOO_LARGE', 'error.too_large');
  end if;

  insert into public.projects (household_id, name, created_by)
  values (v_household, v_name, v_actor)
  returning * into v_project;

  v_response := private.ok_response(to_jsonb(v_project));
  perform private.save_command(v_actor, p_request_id, v_household, 'create_project', v_hash, v_response);
  return v_response;
end;
$$;

create or replace function private.update_project(
  p_request_id uuid,
  p_project_id uuid,
  p_expected_version bigint,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_household uuid;
  v_name text := private.normalized_text(p_name);
  v_hash bytea;
  v_replay jsonb;
  v_project public.projects%rowtype;
  v_response jsonb;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null or p_project_id is null or p_expected_version is null or p_expected_version < 1 then
    return private.error_response('VALIDATION', 'error.command_invalid');
  end if;
  v_household := private.active_household_id(v_actor);
  if v_household is null then return private.error_response('FORBIDDEN', 'error.household_required'); end if;
  if v_name is null or char_length(v_name) > 160 then
    return private.error_response('VALIDATION', 'error.project_invalid');
  end if;

  perform private.lock_command(v_actor, p_request_id);
  if not private.lock_active_members(v_household, array[v_actor]) then
    return private.error_response('FORBIDDEN', 'error.household_required');
  end if;
  v_hash := private.command_hash(jsonb_build_object(
    'project_id', p_project_id, 'expected_version', p_expected_version, 'name', v_name
  ));
  v_replay := private.replay_command(v_actor, p_request_id, 'update_project', v_hash);
  if v_replay is not null then return v_replay; end if;

  select * into v_project from public.projects
  where id = p_project_id and household_id = v_household
  for update;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  if v_project.version <> p_expected_version then
    return private.error_response('CONFLICT', 'error.conflict', v_project.version);
  end if;

  update public.projects set name = v_name
  where id = p_project_id returning * into v_project;
  v_response := private.ok_response(to_jsonb(v_project));
  perform private.save_command(v_actor, p_request_id, v_household, 'update_project', v_hash, v_response);
  return v_response;
end;
$$;

-- Removes the project and ungroups its lists. The lists, archived ones
-- included, keep their tasks and order and each advances its version once.
create or replace function private.delete_project(
  p_request_id uuid,
  p_project_id uuid,
  p_expected_version bigint
)
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
  v_project public.projects%rowtype;
  v_response jsonb;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null or p_project_id is null or p_expected_version is null or p_expected_version < 1 then
    return private.error_response('VALIDATION', 'error.command_invalid');
  end if;
  v_household := private.active_household_id(v_actor);
  if v_household is null then return private.error_response('FORBIDDEN', 'error.household_required'); end if;

  perform private.lock_command(v_actor, p_request_id);
  if not private.lock_active_members(v_household, array[v_actor]) then
    return private.error_response('FORBIDDEN', 'error.household_required');
  end if;
  v_hash := private.command_hash(jsonb_build_object(
    'project_id', p_project_id, 'expected_version', p_expected_version
  ));
  v_replay := private.replay_command(v_actor, p_request_id, 'delete_project', v_hash);
  if v_replay is not null then return v_replay; end if;

  select * into v_project from public.projects
  where id = p_project_id and household_id = v_household
  for update;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  if v_project.version <> p_expected_version then
    return private.error_response('CONFLICT', 'error.conflict', v_project.version);
  end if;

  update public.lists set project_id = null
  where household_id = v_household and project_id = p_project_id;
  delete from public.projects where id = p_project_id;

  v_response := private.ok_response(jsonb_build_object('project_id', p_project_id));
  perform private.save_command(v_actor, p_request_id, v_household, 'delete_project', v_hash, v_response);
  return v_response;
end;
$$;

-- Creates an active list, optionally inside a project, in one transaction.
-- create_list_v2 stays for installed clients and creates an ungrouped list.
create or replace function private.create_list_v3(
  p_request_id uuid,
  p_title text,
  p_subtitle text default null,
  p_notes text default null,
  p_project_id uuid default null
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
  perform private.lock_list_ordering(v_household);
  v_hash := private.command_hash(jsonb_build_object(
    'title', v_title, 'subtitle', v_subtitle, 'notes', v_notes, 'project_id', p_project_id
  ));
  v_replay := private.replay_command(v_actor, p_request_id, 'create_list_v3', v_hash);
  if v_replay is not null then return v_replay; end if;

  if p_project_id is not null then
    perform 1 from public.projects
    where id = p_project_id and household_id = v_household
    for share;
    if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  end if;

  insert into public.lists (household_id, kind, title, subtitle, notes, project_id, created_by)
  values (v_household, 'active', v_title, v_subtitle, v_notes, p_project_id, v_actor)
  returning * into v_list;

  v_response := private.ok_response(to_jsonb(v_list));
  perform private.save_command(v_actor, p_request_id, v_household, 'create_list_v3', v_hash, v_response);
  return v_response;
end;
$$;

-- Moves an active list into a project, or out of every project when
-- p_project_id is null. Only the list's project changes; its position among
-- the household's lists is kept. An unchanged project is a successful no-op
-- that keeps the version.
create or replace function private.set_list_project(
  p_request_id uuid,
  p_list_id uuid,
  p_expected_version bigint,
  p_project_id uuid default null
)
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
  v_list public.lists%rowtype;
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
    'list_id', p_list_id, 'expected_version', p_expected_version, 'project_id', p_project_id
  ));
  v_replay := private.replay_command(v_actor, p_request_id, 'set_list_project', v_hash);
  if v_replay is not null then return v_replay; end if;

  -- Project row before list row, matching delete_project.
  if p_project_id is not null then
    perform 1 from public.projects
    where id = p_project_id and household_id = v_household
    for share;
    if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  end if;

  select * into v_list from public.lists
  where id = p_list_id and household_id = v_household and kind = 'active' and status = 'open'
  for update;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  if v_list.version <> p_expected_version then
    return private.error_response('CONFLICT', 'error.conflict', v_list.version);
  end if;

  if v_list.project_id is distinct from p_project_id then
    update public.lists set project_id = p_project_id
    where id = p_list_id returning * into v_list;
  end if;
  v_response := private.ok_response(to_jsonb(v_list));
  perform private.save_command(v_actor, p_request_id, v_household, 'set_list_project', v_hash, v_response);
  return v_response;
end;
$$;

create or replace function public.create_project(request_id uuid, name text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.create_project(request_id, name); $$;

create or replace function public.update_project(
  request_id uuid, project_id uuid, expected_version bigint, name text
) returns jsonb language sql security invoker set search_path = ''
as $$ select private.update_project(request_id, project_id, expected_version, name); $$;

create or replace function public.delete_project(
  request_id uuid, project_id uuid, expected_version bigint
) returns jsonb language sql security invoker set search_path = ''
as $$ select private.delete_project(request_id, project_id, expected_version); $$;

create or replace function public.create_list_v3(
  request_id uuid, title text, subtitle text default null, notes text default null,
  project_id uuid default null
) returns jsonb language sql security invoker set search_path = ''
as $$ select private.create_list_v3(request_id, title, subtitle, notes, project_id); $$;

create or replace function public.set_list_project(
  request_id uuid, list_id uuid, expected_version bigint, project_id uuid default null
) returns jsonb language sql security invoker set search_path = ''
as $$ select private.set_list_project(request_id, list_id, expected_version, project_id); $$;

create or replace function private.get_projects()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.active_household_id();
  v_count integer;
  v_items jsonb;
begin
  if auth.uid() is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if v_household is null then return private.error_response('NOT_FOUND', 'error.household_required'); end if;

  with summaries as (
    select p.id, p.household_id, p.name, p.created_by, p.created_at, p.updated_at, p.version,
      count(l.id)::integer as list_count
    from public.projects p
    left join public.lists l
      on l.project_id = p.id and l.household_id = p.household_id
      and l.kind = 'active' and l.status = 'open'
    where p.household_id = v_household
    group by p.id
    order by lower(p.name), p.id
    limit private.collection_limit() + 1
  )
  select count(*)::integer,
    coalesce(jsonb_agg(to_jsonb(s) order by lower(s.name), s.id), '[]'::jsonb)
  into v_count, v_items
  from summaries s;

  if v_count > private.collection_limit() then
    return private.error_response('TOO_LARGE', 'error.too_large');
  end if;
  return private.ok_response(jsonb_build_object('items', v_items));
end;
$$;

create or replace function public.get_projects()
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.get_projects(); $$;

-- Match the signed-in-only command boundary, including explicit grants
-- inherited from hosted default privileges. Helpers are granted to nobody
-- else. Replaced functions keep the grants they already had.
revoke all on function private.create_project(uuid, text) from public, anon;
revoke all on function public.create_project(uuid, text) from public, anon;
revoke all on function private.update_project(uuid, uuid, bigint, text) from public, anon;
revoke all on function public.update_project(uuid, uuid, bigint, text) from public, anon;
revoke all on function private.delete_project(uuid, uuid, bigint) from public, anon;
revoke all on function public.delete_project(uuid, uuid, bigint) from public, anon;
revoke all on function private.create_list_v3(uuid, text, text, text, uuid) from public, anon;
revoke all on function public.create_list_v3(uuid, text, text, text, uuid) from public, anon;
revoke all on function private.set_list_project(uuid, uuid, bigint, uuid) from public, anon;
revoke all on function public.set_list_project(uuid, uuid, bigint, uuid) from public, anon;
revoke all on function private.get_projects() from public, anon;
revoke all on function public.get_projects() from public, anon;

grant execute on function private.create_project(uuid, text) to authenticated;
grant execute on function public.create_project(uuid, text) to authenticated;
grant execute on function private.update_project(uuid, uuid, bigint, text) to authenticated;
grant execute on function public.update_project(uuid, uuid, bigint, text) to authenticated;
grant execute on function private.delete_project(uuid, uuid, bigint) to authenticated;
grant execute on function public.delete_project(uuid, uuid, bigint) to authenticated;
grant execute on function private.create_list_v3(uuid, text, text, text, uuid) to authenticated;
grant execute on function public.create_list_v3(uuid, text, text, text, uuid) to authenticated;
grant execute on function private.set_list_project(uuid, uuid, bigint, uuid) to authenticated;
grant execute on function public.set_list_project(uuid, uuid, bigint, uuid) to authenticated;
grant execute on function private.get_projects() to authenticated;
grant execute on function public.get_projects() to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'projects'
    ) then
      alter publication supabase_realtime add table public.projects;
    end if;
  end if;
end;
$$;
