create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.normalized_text(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(translate(value, chr(160) || chr(8239) || chr(12288), '   ')), '');
$$;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_ref text,
  locale text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_normalized check (
    display_name = private.normalized_text(display_name)
    and char_length(display_name) between 1 and 80
  ),
  constraint profiles_avatar_ref_length check (avatar_ref is null or char_length(avatar_ref) <= 500),
  constraint profiles_locale_valid check (locale in ('en', 'bg'))
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  seed_locale text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint households_name_normalized check (
    name = private.normalized_text(name)
    and char_length(name) between 1 and 160
  ),
  constraint households_seed_locale_valid check (seed_locale in ('en', 'bg')),
  unique (id, created_by)
);

create table public.memberships (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, user_id),
  constraint memberships_status_valid check (status in ('active', 'inactive'))
);

create unique index memberships_one_active_household_per_user_idx
on public.memberships (user_id)
where status = 'active';

create index memberships_active_household_user_idx
on public.memberships (household_id, user_id)
where status = 'active';

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  kind text not null,
  title text not null,
  subtitle text,
  status text not null default 'open',
  seed_key text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint lists_kind_valid check (kind in ('template', 'active')),
  constraint lists_status_valid check (status in ('open', 'archived')),
  constraint lists_title_normalized check (
    title = private.normalized_text(title)
    and char_length(title) between 1 and 160
  ),
  constraint lists_subtitle_normalized check (
    subtitle is null
    or (
      subtitle = private.normalized_text(subtitle)
      and char_length(subtitle) <= 300
    )
  ),
  constraint lists_version_positive check (version > 0),
  constraint lists_template_seed_key check (kind = 'active' or seed_key is not null),
  unique (household_id, id),
  unique (household_id, seed_key)
);

create index lists_household_kind_status_id_idx
on public.lists (household_id, kind, status, id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  list_id uuid not null,
  title text not null,
  sort_order integer not null,
  completed boolean not null default false,
  assignee_id uuid,
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint tasks_title_normalized check (
    title = private.normalized_text(title)
    and char_length(title) between 1 and 160
  ),
  constraint tasks_sort_order_nonnegative check (sort_order >= 0),
  constraint tasks_version_positive check (version > 0),
  constraint tasks_list_fk foreign key (household_id, list_id)
    references public.lists(household_id, id) on delete cascade,
  constraint tasks_assignee_membership_fk foreign key (household_id, assignee_id)
    references public.memberships(household_id, user_id),
  unique (list_id, sort_order)
);

create index tasks_household_list_completed_order_idx
on public.tasks (household_id, list_id, completed, sort_order, id);

create index tasks_incomplete_assignee_due_idx
on public.tasks (household_id, assignee_id, due_at, list_id, id)
where completed = false;

create index tasks_incomplete_unassigned_due_idx
on public.tasks (household_id, due_at, list_id, id)
where completed = false and assignee_id is null;

create table private.command_receipts (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  household_id uuid references public.households(id) on delete cascade,
  command_name text not null,
  payload_hash bytea not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_user_id, request_id)
);

create index command_receipts_household_created_idx
on private.command_receipts (household_id, created_at);

create table private.invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  redeemed_by uuid references auth.users(id),
  redeemed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invitations_expiry_after_creation check (expires_at > created_at),
  constraint invitations_redemption_pair check (
    (redeemed_by is null and redeemed_at is null)
    or (redeemed_by is not null and redeemed_at is not null)
  )
);

create index invitations_household_created_idx
on private.invitations (household_id, created_at desc);

create index invitations_creator_rate_limit_idx
on private.invitations (created_by, created_at desc);

create table private.invitation_attempts (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index invitation_attempts_actor_time_idx
on private.invitation_attempts (actor_user_id, attempted_at desc);

create table private.system_secrets (
  name text primary key,
  secret bytea not null,
  created_at timestamptz not null default now()
);

create table private.seed_lists (
  locale text not null,
  seed_key text not null,
  title text not null,
  subtitle text,
  sort_order integer not null,
  primary key (locale, seed_key),
  constraint seed_lists_locale_valid check (locale in ('en', 'bg')),
  constraint seed_lists_order_nonnegative check (sort_order >= 0)
);

create table private.seed_tasks (
  locale text not null,
  list_seed_key text not null,
  task_seed_key text not null,
  title text not null,
  sort_order integer not null,
  primary key (locale, list_seed_key, task_seed_key),
  constraint seed_tasks_order_nonnegative check (sort_order >= 0),
  foreign key (locale, list_seed_key)
    references private.seed_lists(locale, seed_key) on delete cascade,
  unique (locale, list_seed_key, sort_order)
);

create or replace function private.touch_versioned_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := statement_timestamp();
  new.version := old.version + 1;
  return new;
end;
$$;

create trigger lists_touch_version
before update on public.lists
for each row execute function private.touch_versioned_row();

create trigger tasks_touch_version
before update on public.tasks
for each row execute function private.touch_versioned_row();

create or replace function private.touch_membership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

create trigger memberships_touch_updated_at
before update on public.memberships
for each row execute function private.touch_membership();

create or replace function private.validate_task_parent_and_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
    and (new.completed or new.assignee_id is not null or new.due_at is not null) then
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
$$;

create trigger tasks_validate_parent_and_assignee
before insert or update on public.tasks
for each row execute function private.validate_task_parent_and_assignee();
