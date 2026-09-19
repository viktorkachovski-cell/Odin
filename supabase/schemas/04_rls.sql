-- Authorization. Every exposed table has RLS plus deliberate grants; clients never
-- write directly, so receipt/version checks cannot be bypassed.

-- Membership predicate. SECURITY DEFINER breaks RLS recursion on `memberships`, and
-- the body is pinned to auth.uid() so it can only ever answer about the caller --
-- it cannot be used to enumerate anyone else's membership.
create or replace function private.is_active_member(p_household_id uuid)
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.household_id = p_household_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create or replace function private.active_household_id()
returns uuid language sql stable security definer
set search_path = ''
as $$
  select m.household_id from public.memberships m
  where m.user_id = (select auth.uid()) and m.status = 'active';
$$;

alter table public.profiles   enable row level security;
alter table public.households enable row level security;
alter table public.memberships enable row level security;
alter table public.lists      enable row level security;
alter table public.tasks      enable row level security;

alter table public.profiles   force row level security;
alter table public.households force row level security;
alter table public.memberships force row level security;
alter table public.lists      force row level security;
alter table public.tasks      force row level security;

-- Own profile only. Other members' display names come from get_members(), which
-- exposes identity fields without locale or any other private preference.
create policy profiles_select_own on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));

create policy households_select_member on public.households
  for select to authenticated using (private.is_active_member(id));

create policy memberships_select_member on public.memberships
  for select to authenticated using (private.is_active_member(household_id));

create policy lists_select_member on public.lists
  for select to authenticated using (private.is_active_member(household_id));

create policy tasks_select_member on public.tasks
  for select to authenticated using (private.is_active_member(household_id));

-- No INSERT/UPDATE/DELETE policies anywhere: writes are commands only.

revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.households, public.memberships,
                public.lists, public.tasks to authenticated;

-- Private schema stays invisible to PostgREST. USAGE is granted because the
-- SECURITY INVOKER command wrappers resolve private helpers as the caller;
-- every such helper authenticates and authorizes independently.
grant usage on schema private to authenticated;
revoke all on all tables in schema private from anon, authenticated;
alter default privileges in schema private revoke execute on functions from public;

grant execute on function private.is_active_member(uuid) to authenticated;
grant execute on function private.active_household_id() to authenticated;
