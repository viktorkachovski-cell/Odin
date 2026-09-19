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

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.memberships enable row level security;
alter table public.lists enable row level security;
alter table public.tasks enable row level security;

create policy profiles_select_self
on public.profiles for select to authenticated
using ((select auth.uid()) = user_id);

create policy households_select_member
on public.households for select to authenticated
using ((select private.is_active_member(id)));

create policy memberships_select_household
on public.memberships for select to authenticated
using ((select private.is_active_member(household_id)));

create policy lists_select_household
on public.lists for select to authenticated
using ((select private.is_active_member(household_id)));

create policy tasks_select_household
on public.tasks for select to authenticated
using ((select private.is_active_member(household_id)));
