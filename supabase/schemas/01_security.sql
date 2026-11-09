create or replace function private.is_active_member(target_household_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id is not null and exists (
    select 1
    from public.memberships
    where household_id = target_household_id
      and user_id = target_user_id
      and status = 'active'
  );
$$;

create or replace function private.active_household_id(target_user_id uuid default auth.uid())
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select household_id
  from public.memberships
  where user_id = target_user_id and status = 'active'
  limit 1;
$$;

create or replace function private.command_hash(payload jsonb)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select extensions.digest(convert_to(payload::text, 'utf8'), 'sha256');
$$;

create or replace function private.error_response(
  error_code text,
  message_key text,
  current_version bigint default null
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'ok', false,
    'error', jsonb_strip_nulls(jsonb_build_object(
      'code', error_code,
      'message_key', message_key,
      'current_version', current_version
    ))
  );
$$;

create or replace function private.ok_response(data jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('ok', true, 'data', data);
$$;

create or replace function private.replay_command(
  p_actor_id uuid,
  p_request_id uuid,
  p_command_name text,
  p_payload_hash bytea
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  receipt private.command_receipts%rowtype;
begin
  select * into receipt
  from private.command_receipts
  where actor_user_id = p_actor_id and request_id = p_request_id;

  if not found then
    return null;
  end if;

  if receipt.command_name <> p_command_name or receipt.payload_hash <> p_payload_hash then
    return private.error_response('IDEMPOTENCY_MISMATCH', 'error.idempotency_mismatch');
  end if;

  if receipt.household_id is not null
    and not private.is_active_member(receipt.household_id, p_actor_id) then
    return private.error_response('NOT_FOUND', 'error.not_found');
  end if;

  return receipt.response;
end;
$$;

create or replace function private.save_command(
  actor_id uuid,
  request_id uuid,
  household_id uuid,
  command_name text,
  payload_hash bytea,
  response jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.command_receipts (
    actor_user_id, request_id, household_id, command_name, payload_hash, response
  ) values (
    actor_id, request_id, household_id, command_name, payload_hash, response
  );
$$;

create or replace function private.invitation_secret()
returns bytea
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  value bytea;
begin
  insert into private.system_secrets (name, secret)
  values ('invitation_hmac', extensions.gen_random_bytes(32))
  on conflict (name) do nothing;

  select secret into value
  from private.system_secrets
  where name = 'invitation_hmac';

  return value;
end;
$$;

create or replace function private.invitation_token(invitation_id uuid)
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select rtrim(
    translate(
      encode(
        extensions.hmac(
          convert_to(invitation_id::text, 'utf8'),
          private.invitation_secret(),
          'sha256'
        ),
        'base64'
      ),
      '+/',
      '-_'
    ),
    '='
  );
$$;

create or replace function private.lock_active_members(
  p_household_id uuid,
  p_user_ids uuid[]
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected integer;
  v_found integer := 0;
  v_member record;
begin
  select count(distinct user_id)::integer into v_expected
  from unnest(p_user_ids) as requested(user_id)
  where user_id is not null;

  for v_member in
    select user_id, status
    from public.memberships
    where household_id = p_household_id and user_id = any(p_user_ids)
    order by user_id
    for update
  loop
    if v_member.status <> 'active' then return false; end if;
    v_found := v_found + 1;
  end loop;

  return v_found = v_expected;
end;
$$;

create or replace function private.lock_command(p_actor_id uuid, p_request_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  select pg_advisory_xact_lock(
    hashtextextended(p_actor_id::text || ':' || p_request_id::text, 1)
  );
$$;

-- Locks the open parent list of a household task and returns its id, or null
-- when the task is missing, archived or outside the household. Every command
-- that changes a task's position or completion group -- create, delete,
-- complete, set state, move -- takes this lock before touching task rows, so
-- those changes serialise per list and a move always sees committed
-- neighbours. Lock order is membership rows, then this list row, then task
-- rows.
create or replace function private.lock_task_list(
  p_household_id uuid,
  p_task_id uuid,
  p_active_only boolean
)
returns uuid
language sql
volatile
security definer
set search_path = ''
as $$
  select l.id
  from public.tasks t
  join public.lists l on l.id = t.list_id and l.household_id = t.household_id
  where t.id = p_task_id and t.household_id = p_household_id and l.status = 'open'
    and (not p_active_only or l.kind = 'active')
  for update of l;
$$;

-- Assignment helpers. Invoker functions: they only run inside the privileged
-- command and read helpers, and are granted to nobody.

create or replace function private.max_task_assignees()
returns integer
language sql
immutable
set search_path = ''
as $$ select 50; $$;

-- The one canonical form of an assignment set: distinct ids in ascending
-- order. Returns null for input no honest client sends (a null array or
-- element, a multidimensional array, or more than the limit), so callers
-- answer VALIDATION. Hashing the canonical form makes a retry that re-orders
-- or repeats ids the same request.
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

-- What a single-assignee client is told: the viewer when the viewer is
-- assigned, otherwise the lowest assignee id, otherwise null. Showing every
-- assignee their own task keeps "assignee_id = me" correct in installed
-- clients' Mine view, badge and notifications.
create or replace function private.legacy_assignee_id(p_ids uuid[], p_viewer uuid)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when p_viewer is not null and p_viewer = any(p_ids) then p_viewer else p_ids[1] end;
$$;

-- Every task payload: the stored row plus its assignment set and the
-- viewer's legacy projection of it. One row per task, never per assignee.
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

-- Makes the stored set equal p_user_ids and reports whether it changed.
-- Retained members keep their row; callers hold the task and member locks and
-- follow a change with one UPDATE of tasks, which advances the version once.
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

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.memberships enable row level security;
alter table public.projects enable row level security;
alter table public.lists enable row level security;
alter table public.tasks enable row level security;
alter table public.task_templates enable row level security;
-- No policy and no grant: clients never read or write assignments directly.
-- They arrive inside task payloads (private.task_json) and change only through
-- the assignment commands.
alter table public.task_assignees enable row level security;

create policy profiles_select_self
on public.profiles for select to authenticated
using ((select auth.uid()) = user_id);

create policy households_select_member
on public.households for select to authenticated
using ((select private.is_active_member(id)));

create policy memberships_select_household
on public.memberships for select to authenticated
using ((select private.is_active_member(household_id)));

create policy projects_select_household
on public.projects for select to authenticated
using ((select private.is_active_member(household_id)));

create policy lists_select_household
on public.lists for select to authenticated
using ((select private.is_active_member(household_id)));

create policy tasks_select_household
on public.tasks for select to authenticated
using ((select private.is_active_member(household_id)));
