-- Multiple assignees per task (owner amendment 2026-11-04).
--
-- Replaces the single nullable tasks.assignee_id with a normalized
-- public.task_assignees relation. tasks.assignee_id stays as the legacy
-- single-assignee projection (the lowest assignee user id) for installed
-- clients; every command writes it with the set and a deferred constraint
-- trigger proves they agree. Existing assignments are copied across before the
-- new triggers exist, so no row is lost or rejected, and no task version moves.
--
-- Additive for installed clients: no existing RPC signature or grant changes.
-- New: create_task_v3, update_task_v3, set_task_assignees, add_task_assignee,
-- remove_task_assignee, get_task_v2. See docs/contract.md.

alter table public.tasks
  add constraint tasks_household_id_id_key unique (household_id, id);

create table public.task_assignees (
  task_id uuid not null,
  household_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (task_id, user_id),
  constraint task_assignees_task_fk foreign key (household_id, task_id)
    references public.tasks(household_id, id) on delete cascade,
  -- Cascade so deleting a household removes its assignments whichever order
  -- the household's own cascades run in.
  constraint task_assignees_membership_fk foreign key (household_id, user_id)
    references public.memberships(household_id, user_id) on delete cascade
);

create index task_assignees_member_task_idx
on public.task_assignees (household_id, user_id, task_id);

alter table public.task_assignees enable row level security;
-- Hosted default privileges would otherwise grant the new table to the API
-- roles. Clients never touch assignments directly: no policy, no grant.
revoke all on public.task_assignees from public, anon, authenticated;

-- Every existing assignment, including one held by a since-deactivated member
-- and one on a task in an archived list. Done before the validating triggers
-- exist, and without touching tasks, so versions and updated_at are unchanged.
insert into public.task_assignees (task_id, household_id, user_id)
select id, household_id, assignee_id
from public.tasks
where assignee_id is not null
order by id;

do $$
declare
  v_tasks bigint;
  v_assignments bigint;
begin
  select count(*) into v_tasks from public.tasks where assignee_id is not null;
  select count(*) into v_assignments from public.task_assignees;
  if v_tasks <> v_assignments then
    raise exception 'assignment backfill copied % of % assignments', v_assignments, v_tasks;
  end if;
end;
$$;

create or replace function private.validate_task_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_kind text;
  parent_status text;
begin
  select l.kind, l.status into parent_kind, parent_status
  from public.tasks t
  join public.lists l on l.id = t.list_id and l.household_id = t.household_id
  where t.id = new.task_id and t.household_id = new.household_id;

  if parent_kind is null then
    raise exception 'assigned task not found' using errcode = '23503';
  end if;
  if parent_kind = 'template' then
    raise exception 'template tasks cannot carry runtime state' using errcode = '23514';
  end if;
  if parent_status <> 'open' then
    raise exception 'archived lists cannot be changed' using errcode = '23514';
  end if;

  -- The share lock makes an assignment and a concurrent revocation of the same
  -- membership serialise: whichever commits second sees the other's outcome.
  perform 1 from public.memberships
  where household_id = new.household_id and user_id = new.user_id and status = 'active'
  for share;
  if not found then
    raise exception 'assignee must be an active household member' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function private.reject_task_assignee_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'task assignments are added and removed, never edited' using errcode = '23514';
end;
$$;

create or replace function private.assignee_ids(p_task_id uuid)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(
    array(select user_id from public.task_assignees where task_id = p_task_id order by user_id),
    '{}'::uuid[]
  );
$$;

create or replace function private.verify_assignee_projection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task_id uuid;
  v_actual uuid;
  v_found boolean;
begin
  if tg_table_name = 'tasks' then
    v_task_id := new.id;
  elsif tg_op = 'DELETE' then
    v_task_id := old.task_id;
  else
    v_task_id := new.task_id;
  end if;

  select assignee_id, true into v_actual, v_found from public.tasks where id = v_task_id;
  -- The task itself was deleted in this transaction; its assignments went with it.
  if not coalesce(v_found, false) then return null; end if;

  if v_actual is distinct from (private.assignee_ids(v_task_id))[1] then
    raise exception 'tasks.assignee_id must be the lowest task_assignees user id'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create trigger task_assignees_validate
before insert on public.task_assignees
for each row execute function private.validate_task_assignee();

create trigger task_assignees_immutable
before update on public.task_assignees
for each row execute function private.reject_task_assignee_update();

create constraint trigger tasks_assignee_projection
after insert or update of assignee_id on public.tasks
deferrable initially deferred
for each row execute function private.verify_assignee_projection();

create constraint trigger task_assignees_projection
after insert or delete on public.task_assignees
deferrable initially deferred
for each row execute function private.verify_assignee_projection();

create or replace function private.max_task_assignees()
returns integer
language sql
immutable
set search_path = ''
as $$ select 50; $$;

create or replace function private.canonical_assignee_ids(p_ids uuid[])
returns uuid[]
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_ids is null
    or coalesce(array_ndims(p_ids), 1) <> 1
    or array_position(p_ids, null) is not null
    or cardinality(p_ids) > private.max_task_assignees() then
    return null;
  end if;
  return array(select distinct u from unnest(p_ids) as ids(u) order by u);
end;
$$;

create or replace function private.legacy_assignee_id(p_ids uuid[], p_viewer uuid)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when p_viewer is not null and p_viewer = any(p_ids) then p_viewer else p_ids[1] end;
$$;

create or replace function private.task_json(p_task jsonb, p_viewer uuid default null)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select p_task || jsonb_build_object(
    'assignee_ids', to_jsonb(a.ids),
    'assignee_id', private.legacy_assignee_id(a.ids, p_viewer)
  )
  from (select private.assignee_ids((p_task ->> 'id')::uuid) as ids) a;
$$;

create or replace function private.sync_task_assignees(
  p_household_id uuid,
  p_task_id uuid,
  p_user_ids uuid[]
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_removed integer;
  v_added integer;
begin
  delete from public.task_assignees
  where task_id = p_task_id and household_id = p_household_id
    and not (user_id = any(p_user_ids));
  get diagnostics v_removed = row_count;

  insert into public.task_assignees (task_id, household_id, user_id)
  select p_task_id, p_household_id, u from unnest(p_user_ids) as ids(u)
  order by u
  on conflict (task_id, user_id) do nothing;
  get diagnostics v_added = row_count;

  return v_removed + v_added > 0;
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
  perform private.sync_task_assignees(
    v_household, v_task.id, array_remove(array[p_assignee_id], null)
  );
  v_response := private.ok_response(private.task_json(to_jsonb(v_task), v_actor));
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
  perform private.sync_task_assignees(
    v_household, v_task.id, array_remove(array[p_assignee_id], null)
  );
  v_response := private.ok_response(private.task_json(to_jsonb(v_task), v_actor));
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
  v_current uuid[];
  v_next uuid[];
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

  -- See update_task_v2: never reduce several assignees to the one this
  -- editor was shown.
  v_current := private.assignee_ids(p_task_id);
  if cardinality(v_current) > 1 then
    if p_assignee_id is distinct from private.legacy_assignee_id(v_current, v_actor)
      and p_assignee_id is distinct from v_current[1] then
      return private.error_response('CONFLICT', 'error.task_multiple_assignees', v_task.version);
    end if;
    v_next := v_current;
  else
    v_next := array_remove(array[p_assignee_id], null);
  end if;
  perform private.sync_task_assignees(v_household, p_task_id, v_next);

  update public.tasks set title = v_title, assignee_id = v_next[1], due_at = p_due_at
  where id = p_task_id returning * into v_task;
  v_response := private.ok_response(private.task_json(to_jsonb(v_task), v_actor));
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
  v_current uuid[];
  v_next uuid[];
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

  -- A single-assignee editor cannot represent several assignees. It may keep
  -- what it was shown, or change a task with at most one assignee; it can
  -- never reduce a larger set to one, so that is refused instead.
  v_current := private.assignee_ids(p_task_id);
  if cardinality(v_current) > 1 then
    if p_assignee_id is distinct from private.legacy_assignee_id(v_current, v_actor)
      and p_assignee_id is distinct from v_current[1] then
      return private.error_response('CONFLICT', 'error.task_multiple_assignees', v_task.version);
    end if;
    v_next := v_current;
  else
    v_next := array_remove(array[p_assignee_id], null);
  end if;
  perform private.sync_task_assignees(v_household, p_task_id, v_next);

  update public.tasks
  set title = v_title, notes = v_notes, assignee_id = v_next[1], due_at = p_due_at
  where id = p_task_id returning * into v_task;
  v_response := private.ok_response(private.task_json(to_jsonb(v_task), v_actor));
  perform private.save_command(v_actor, p_request_id, v_household, 'update_task_v2', v_hash, v_response);
  return v_response;
end;
$$;

create or replace function private.set_task_completed(
  p_request_id uuid,
  p_task_id uuid,
  p_expected_version bigint,
  p_completed boolean
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
  v_response := private.ok_response(private.task_json(to_jsonb(v_task), v_actor));
  perform private.save_command(
    v_actor, p_request_id, v_household, 'set_task_completed', v_hash, v_response
  );
  return v_response;
end;
$$;

create or replace function private.set_task_state(
  p_request_id uuid,
  p_task_id uuid,
  p_expected_version bigint,
  p_state text
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
  v_response := private.ok_response(private.task_json(to_jsonb(v_task), v_actor));
  perform private.save_command(v_actor, p_request_id, v_household, 'set_task_state', v_hash, v_response);
  return v_response;
end;
$$;

create or replace function private.claim_task(
  p_request_id uuid,
  p_task_id uuid,
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
  if exists (select 1 from public.task_assignees where task_id = p_task_id) then
    return private.error_response('ALREADY_ASSIGNED', 'error.already_assigned', v_task.version);
  end if;

  perform private.sync_task_assignees(v_household, p_task_id, array[v_actor]);
  update public.tasks set assignee_id = v_actor
  where id = p_task_id returning * into v_task;
  v_response := private.ok_response(private.task_json(to_jsonb(v_task), v_actor));
  perform private.save_command(v_actor, p_request_id, v_household, 'claim_task', v_hash, v_response);
  return v_response;
end;
$$;

create or replace function private.create_task_v3(
  p_request_id uuid,
  p_list_id uuid,
  p_title text,
  p_assignee_ids uuid[] default '{}',
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
  v_ids uuid[] := private.canonical_assignee_ids(p_assignee_ids);
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
  if v_ids is null then return private.error_response('VALIDATION', 'error.assignee_invalid'); end if;
  perform private.lock_command(v_actor, p_request_id);
  v_hash := private.command_hash(jsonb_build_object(
    'list_id', p_list_id, 'title', v_title, 'notes', v_notes,
    'assignee_ids', to_jsonb(v_ids), 'due_at', p_due_at
  ));
  v_replay := private.replay_command(v_actor, p_request_id, 'create_task_v3', v_hash);
  if v_replay is not null then return v_replay; end if;

  if not private.lock_active_members(v_household, v_ids || v_actor) then
    return private.error_response('VALIDATION', 'error.assignee_invalid');
  end if;
  select kind into v_kind from public.lists
  where id = p_list_id and household_id = v_household and status = 'open'
  for update;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  if v_kind = 'template' and (cardinality(v_ids) > 0 or p_due_at is not null) then
    return private.error_response('VALIDATION', 'error.template_task_runtime');
  end if;
  select coalesce(max(sort_order), -1) + 1 into v_order from public.tasks where list_id = p_list_id;

  insert into public.tasks (household_id, list_id, title, sort_order, assignee_id, due_at, notes)
  values (v_household, p_list_id, v_title, v_order, v_ids[1], p_due_at, v_notes)
  returning * into v_task;
  perform private.sync_task_assignees(v_household, v_task.id, v_ids);
  v_response := private.ok_response(private.task_json(to_jsonb(v_task), v_actor));
  perform private.save_command(v_actor, p_request_id, v_household, 'create_task_v3', v_hash, v_response);
  return v_response;
end;
$$;

create or replace function private.update_task_v3(
  p_request_id uuid,
  p_task_id uuid,
  p_expected_version bigint,
  p_title text,
  p_assignee_ids uuid[] default '{}',
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
  v_ids uuid[] := private.canonical_assignee_ids(p_assignee_ids);
  v_hash bytea;
  v_replay jsonb;
  v_task public.tasks%rowtype;
  v_response jsonb;
  v_kind text;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null or p_task_id is null or p_expected_version is null or p_expected_version < 1 then
    return private.error_response('VALIDATION', 'error.command_invalid');
  end if;
  v_household := private.active_household_id(v_actor);
  if v_household is null then return private.error_response('FORBIDDEN', 'error.household_required'); end if;
  if v_title is null or char_length(v_title) > 500 or char_length(v_notes) > 5000 then
    return private.error_response('VALIDATION', 'error.task_invalid');
  end if;
  if v_ids is null then return private.error_response('VALIDATION', 'error.assignee_invalid'); end if;
  perform private.lock_command(v_actor, p_request_id);
  v_hash := private.command_hash(jsonb_build_object(
    'task_id', p_task_id, 'expected_version', p_expected_version,
    'title', v_title, 'notes', v_notes,
    'assignee_ids', to_jsonb(v_ids), 'due_at', p_due_at
  ));
  v_replay := private.replay_command(v_actor, p_request_id, 'update_task_v3', v_hash);
  if v_replay is not null then return v_replay; end if;
  if not private.lock_active_members(v_household, v_ids || v_actor) then
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
  if v_kind = 'template' and (cardinality(v_ids) > 0 or p_due_at is not null) then
    return private.error_response('VALIDATION', 'error.template_task_runtime');
  end if;

  perform private.sync_task_assignees(v_household, p_task_id, v_ids);
  update public.tasks
  set title = v_title, notes = v_notes, assignee_id = v_ids[1], due_at = p_due_at
  where id = p_task_id returning * into v_task;
  v_response := private.ok_response(private.task_json(to_jsonb(v_task), v_actor));
  perform private.save_command(v_actor, p_request_id, v_household, 'update_task_v3', v_hash, v_response);
  return v_response;
end;
$$;

create or replace function private.set_task_assignees(
  p_request_id uuid,
  p_task_id uuid,
  p_expected_version bigint,
  p_assignee_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_household uuid;
  v_ids uuid[] := private.canonical_assignee_ids(p_assignee_ids);
  v_hash bytea;
  v_replay jsonb;
  v_task public.tasks%rowtype;
  v_response jsonb;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null or p_task_id is null or p_expected_version is null or p_expected_version < 1 then
    return private.error_response('VALIDATION', 'error.command_invalid');
  end if;
  v_household := private.active_household_id(v_actor);
  if v_household is null then return private.error_response('FORBIDDEN', 'error.household_required'); end if;
  if v_ids is null then return private.error_response('VALIDATION', 'error.assignee_invalid'); end if;
  perform private.lock_command(v_actor, p_request_id);
  v_hash := private.command_hash(jsonb_build_object(
    'task_id', p_task_id, 'expected_version', p_expected_version, 'assignee_ids', to_jsonb(v_ids)
  ));
  v_replay := private.replay_command(v_actor, p_request_id, 'set_task_assignees', v_hash);
  if v_replay is not null then return v_replay; end if;
  if not private.lock_active_members(v_household, v_ids || v_actor) then
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

  if private.sync_task_assignees(v_household, p_task_id, v_ids) then
    update public.tasks set assignee_id = v_ids[1]
    where id = p_task_id returning * into v_task;
  end if;
  v_response := private.ok_response(private.task_json(to_jsonb(v_task), v_actor));
  perform private.save_command(v_actor, p_request_id, v_household, 'set_task_assignees', v_hash, v_response);
  return v_response;
end;
$$;

create or replace function private.add_task_assignee(
  p_request_id uuid,
  p_task_id uuid,
  p_user_id uuid
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
  v_task public.tasks%rowtype;
  v_response jsonb;
  v_added integer;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null or p_task_id is null or p_user_id is null then
    return private.error_response('VALIDATION', 'error.command_invalid');
  end if;
  v_household := private.active_household_id(v_actor);
  if v_household is null then return private.error_response('FORBIDDEN', 'error.household_required'); end if;
  perform private.lock_command(v_actor, p_request_id);
  v_hash := private.command_hash(jsonb_build_object('task_id', p_task_id, 'user_id', p_user_id));
  v_replay := private.replay_command(v_actor, p_request_id, 'add_task_assignee', v_hash);
  if v_replay is not null then return v_replay; end if;
  if not private.lock_active_members(v_household, array[v_actor, p_user_id]) then
    return private.error_response('VALIDATION', 'error.assignee_invalid');
  end if;

  select t.* into v_task from public.tasks t
  join public.lists l on l.id = t.list_id and l.household_id = t.household_id
  where t.id = p_task_id and t.household_id = v_household
    and l.kind = 'active' and l.status = 'open'
  for update of t;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;

  insert into public.task_assignees (task_id, household_id, user_id)
  values (p_task_id, v_household, p_user_id)
  on conflict (task_id, user_id) do nothing;
  get diagnostics v_added = row_count;
  if v_added > 0 then
    update public.tasks set assignee_id = (private.assignee_ids(p_task_id))[1]
    where id = p_task_id returning * into v_task;
  end if;
  v_response := private.ok_response(private.task_json(to_jsonb(v_task), v_actor));
  perform private.save_command(v_actor, p_request_id, v_household, 'add_task_assignee', v_hash, v_response);
  return v_response;
end;
$$;

create or replace function private.remove_task_assignee(
  p_request_id uuid,
  p_task_id uuid,
  p_user_id uuid
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
  v_task public.tasks%rowtype;
  v_response jsonb;
  v_removed integer;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null or p_task_id is null or p_user_id is null then
    return private.error_response('VALIDATION', 'error.command_invalid');
  end if;
  v_household := private.active_household_id(v_actor);
  if v_household is null then return private.error_response('FORBIDDEN', 'error.household_required'); end if;
  perform private.lock_command(v_actor, p_request_id);
  v_hash := private.command_hash(jsonb_build_object('task_id', p_task_id, 'user_id', p_user_id));
  v_replay := private.replay_command(v_actor, p_request_id, 'remove_task_assignee', v_hash);
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

  delete from public.task_assignees
  where task_id = p_task_id and household_id = v_household and user_id = p_user_id;
  get diagnostics v_removed = row_count;
  if v_removed > 0 then
    update public.tasks set assignee_id = (private.assignee_ids(p_task_id))[1]
    where id = p_task_id returning * into v_task;
  end if;
  v_response := private.ok_response(private.task_json(to_jsonb(v_task), v_actor));
  perform private.save_command(v_actor, p_request_id, v_household, 'remove_task_assignee', v_hash, v_response);
  return v_response;
end;
$$;

create or replace function public.create_task_v3(
  request_id uuid, list_id uuid, title text, assignee_ids uuid[] default '{}',
  due_at timestamptz default null, notes text default null
)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.create_task_v3(request_id, list_id, title, assignee_ids, due_at, notes); $$;

create or replace function public.update_task_v3(
  request_id uuid, task_id uuid, expected_version bigint, title text,
  assignee_ids uuid[] default '{}', due_at timestamptz default null, notes text default null
)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.update_task_v3(request_id, task_id, expected_version, title, assignee_ids, due_at, notes); $$;

create or replace function public.set_task_assignees(
  request_id uuid, task_id uuid, expected_version bigint, assignee_ids uuid[]
)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.set_task_assignees(request_id, task_id, expected_version, assignee_ids); $$;

create or replace function public.add_task_assignee(request_id uuid, task_id uuid, user_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.add_task_assignee(request_id, task_id, user_id); $$;

create or replace function public.remove_task_assignee(request_id uuid, task_id uuid, user_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.remove_task_assignee(request_id, task_id, user_id); $$;

create or replace function private.get_list_v2(p_list_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
    coalesce(
      jsonb_agg(private.task_json(to_jsonb(lt), auth.uid()) order by lt.completed, lt.sort_order, lt.id),
      '[]'::jsonb
    )
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
$$;

create or replace function private.get_list_v1(
  p_list_id uuid,
  p_cursor text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.active_household_id();
  v_cursor jsonb := private.decode_cursor(p_cursor);
  v_completed boolean;
  v_order integer;
  v_id uuid;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 50);
  v_list jsonb;
  v_items jsonb;
  v_last record;
  v_total integer;
  v_done integer;
  v_more boolean;
begin
  if auth.uid() is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if v_household is null then return private.error_response('NOT_FOUND', 'error.household_required'); end if;
  if p_cursor is not null and v_cursor is null then
    return private.error_response('VALIDATION', 'error.cursor_invalid');
  end if;

  select to_jsonb(l) into v_list from public.lists l
  where id = p_list_id and household_id = v_household and status = 'open';
  if v_list is null then return private.error_response('NOT_FOUND', 'error.not_found'); end if;

  if v_cursor is not null then
    v_completed := (v_cursor ->> 'completed')::boolean;
    v_order := (v_cursor ->> 'sort_order')::integer;
    v_id := (v_cursor ->> 'id')::uuid;
  end if;

  select count(*)::integer, count(*) filter (where completed)::integer
  into v_total, v_done from public.tasks where list_id = p_list_id;

  with page as (
    select t.* from public.tasks t
    where t.list_id = p_list_id
      and (v_cursor is null or (t.completed, t.sort_order, t.id) > (v_completed, v_order, v_id))
    order by t.completed, t.sort_order, t.id
    limit v_limit + 1
  ), visible as (
    select * from page order by completed, sort_order, id limit v_limit
  )
  select coalesce(
    jsonb_agg(private.task_json(to_jsonb(visible), auth.uid()) order by completed, sort_order, id),
    '[]'::jsonb
  )
  into v_items from visible;

  select completed, sort_order, id into v_last
  from public.tasks t
  where t.list_id = p_list_id
    and (v_cursor is null or (t.completed, t.sort_order, t.id) > (v_completed, v_order, v_id))
  order by completed, sort_order, id offset greatest(v_limit - 1, 0) limit 1;
  select exists (
    select 1 from public.tasks t
    where t.list_id = p_list_id
      and (v_cursor is null or (t.completed, t.sort_order, t.id) > (v_completed, v_order, v_id))
    offset v_limit limit 1
  ) into v_more;

  return private.ok_response(jsonb_build_object(
    'list', v_list,
    'total_tasks', v_total,
    'completed_tasks', v_done,
    'progress_percent', case when v_total = 0 then 0 else round(v_done * 100.0 / v_total)::integer end,
    'tasks', v_items,
    'next_cursor', case when v_more then private.encode_cursor(jsonb_build_object(
      'completed', v_last.completed, 'sort_order', v_last.sort_order, 'id', v_last.id
    )) else null end
  ));
end;
$$;

create or replace function private.get_cross_list_tasks(
  mode text,
  p_cursor text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
      and ((mode = 'mine' and exists (
          select 1 from public.task_assignees ta where ta.task_id = t.id and ta.user_id = v_actor))
        or (mode = 'unassigned' and not exists (
          select 1 from public.task_assignees ta where ta.task_id = t.id)))
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
      and ((mode = 'mine' and exists (
          select 1 from public.task_assignees ta where ta.task_id = t.id and ta.user_id = v_actor))
        or (mode = 'unassigned' and not exists (
          select 1 from public.task_assignees ta where ta.task_id = t.id)))
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
      and ((mode = 'mine' and exists (
          select 1 from public.task_assignees ta where ta.task_id = t.id and ta.user_id = v_actor))
        or (mode = 'unassigned' and not exists (
          select 1 from public.task_assignees ta where ta.task_id = t.id)))
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
$$;

create or replace function private.get_household_tasks(
  p_scope text,
  p_due_from timestamptz,
  p_due_before timestamptz,
  p_undated boolean,
  p_incomplete_only boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
        or (p_scope = 'mine' and exists (
          select 1 from public.task_assignees ta where ta.task_id = t.id and ta.user_id = v_actor))
        or (p_scope = 'unassigned' and not exists (
          select 1 from public.task_assignees ta where ta.task_id = t.id)))
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
    coalesce(
      jsonb_agg(private.task_json(to_jsonb(m), v_actor) order by m.due_at nulls last, m.created_at, m.id),
      '[]'::jsonb
    )
  into v_count, v_items
  from matches m;

  if v_count > private.collection_limit() then
    return private.error_response('TOO_LARGE', 'error.too_large');
  end if;
  return private.ok_response(jsonb_build_object('items', v_items));
end;
$$;

create or replace function private.get_task_v2(p_task_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_household uuid := private.active_household_id();
  v_task jsonb;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if v_household is null then return private.error_response('NOT_FOUND', 'error.household_required'); end if;

  select to_jsonb(t) into v_task
  from public.tasks t
  join public.lists l on l.id = t.list_id and l.household_id = t.household_id
  where t.id = p_task_id and t.household_id = v_household and l.status = 'open';
  if v_task is null then return private.error_response('NOT_FOUND', 'error.not_found'); end if;

  return private.ok_response(private.task_json(v_task, v_actor));
end;
$$;

create or replace function public.get_list(
  p_list_id uuid,
  p_cursor text default null,
  p_limit integer default 50
)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.get_list_v1(p_list_id, p_cursor, p_limit); $$;

create or replace function public.get_task_v2(p_task_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $$ select private.get_task_v2(p_task_id); $$;

-- Match the signed-in-only command boundary, including explicit grants
-- inherited from hosted default privileges. Helpers are granted to nobody.
revoke all on function private.create_task_v3(uuid, uuid, text, uuid[], timestamptz, text) from public, anon;
revoke all on function public.create_task_v3(uuid, uuid, text, uuid[], timestamptz, text) from public, anon;
revoke all on function private.update_task_v3(uuid, uuid, bigint, text, uuid[], timestamptz, text) from public, anon;
revoke all on function public.update_task_v3(uuid, uuid, bigint, text, uuid[], timestamptz, text) from public, anon;
revoke all on function private.set_task_assignees(uuid, uuid, bigint, uuid[]) from public, anon;
revoke all on function public.set_task_assignees(uuid, uuid, bigint, uuid[]) from public, anon;
revoke all on function private.add_task_assignee(uuid, uuid, uuid) from public, anon;
revoke all on function public.add_task_assignee(uuid, uuid, uuid) from public, anon;
revoke all on function private.remove_task_assignee(uuid, uuid, uuid) from public, anon;
revoke all on function public.remove_task_assignee(uuid, uuid, uuid) from public, anon;
revoke all on function private.get_task_v2(uuid) from public, anon;
revoke all on function public.get_task_v2(uuid) from public, anon;
revoke all on function private.get_list_v1(uuid, text, integer) from public, anon;
revoke all on function private.max_task_assignees() from public, anon, authenticated;
revoke all on function private.canonical_assignee_ids(uuid[]) from public, anon, authenticated;
revoke all on function private.legacy_assignee_id(uuid[], uuid) from public, anon, authenticated;
revoke all on function private.task_json(jsonb, uuid) from public, anon, authenticated;
revoke all on function private.sync_task_assignees(uuid, uuid, uuid[]) from public, anon, authenticated;
revoke all on function private.assignee_ids(uuid) from public, anon, authenticated;
revoke all on function private.validate_task_assignee() from public, anon, authenticated;
revoke all on function private.reject_task_assignee_update() from public, anon, authenticated;
revoke all on function private.verify_assignee_projection() from public, anon, authenticated;

grant execute on function private.create_task_v3(uuid, uuid, text, uuid[], timestamptz, text) to authenticated;
grant execute on function public.create_task_v3(uuid, uuid, text, uuid[], timestamptz, text) to authenticated;
grant execute on function private.update_task_v3(uuid, uuid, bigint, text, uuid[], timestamptz, text) to authenticated;
grant execute on function public.update_task_v3(uuid, uuid, bigint, text, uuid[], timestamptz, text) to authenticated;
grant execute on function private.set_task_assignees(uuid, uuid, bigint, uuid[]) to authenticated;
grant execute on function public.set_task_assignees(uuid, uuid, bigint, uuid[]) to authenticated;
grant execute on function private.add_task_assignee(uuid, uuid, uuid) to authenticated;
grant execute on function public.add_task_assignee(uuid, uuid, uuid) to authenticated;
grant execute on function private.remove_task_assignee(uuid, uuid, uuid) to authenticated;
grant execute on function public.remove_task_assignee(uuid, uuid, uuid) to authenticated;
grant execute on function private.get_task_v2(uuid) to authenticated;
grant execute on function public.get_task_v2(uuid) to authenticated;
grant execute on function private.get_list_v1(uuid, text, integer) to authenticated;
