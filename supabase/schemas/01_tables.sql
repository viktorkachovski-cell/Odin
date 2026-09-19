-- Odin core schema. See docs/02-CONTRACT.md for the authoritative field list.
-- All writes go through command RPCs; clients hold SELECT only.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create extension if not exists pgcrypto with schema extensions;

-- Length limits from docs/01-DECISIONS.md, counted in Unicode code points.
create or replace function private.trimmed_len(p_text text)
returns integer language sql immutable parallel safe
set search_path = ''
as $$ select char_length(btrim(coalesce(p_text, ''))) $$;

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  avatar_ref text,
  locale text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_locale_supported check (locale in ('en', 'bg')),
  constraint profiles_display_name_length check (private.trimmed_len(display_name) between 1 and 80)
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  seed_locale text not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint households_seed_locale_supported check (seed_locale in ('en', 'bg')),
  constraint households_name_length check (private.trimmed_len(name) between 1 and 80)
);

create table public.memberships (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, user_id),
  constraint memberships_status_supported check (status in ('active', 'inactive'))
);

-- One active household per account (docs/02-CONTRACT.md).
create unique index memberships_single_active_household
  on public.memberships (user_id) where status = 'active';
create index memberships_household_active
  on public.memberships (household_id, user_id) where status = 'active';

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  kind text not null,
  title text not null,
  subtitle text,
  status text not null default 'open',
  seed_key text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint lists_kind_supported check (kind in ('template', 'active')),
  constraint lists_status_supported check (status in ('open', 'archived')),
  constraint lists_version_positive check (version > 0),
  constraint lists_title_length check (private.trimmed_len(title) between 1 and 160),
  -- Empty subtitles are normalised to null by the commands; reject blanks outright.
  constraint lists_subtitle_length check (
    subtitle is null or private.trimmed_len(subtitle) between 1 and 300
  ),
  -- NO deadline column on lists, by product rule.
  constraint lists_household_id_unique unique (household_id, id),
  constraint lists_household_id_kind_unique unique (household_id, id, kind)
);

create index lists_household_kind_status on public.lists (household_id, kind, status);
-- Retried seeding cannot duplicate a template.
create unique index lists_household_seed_key
  on public.lists (household_id, seed_key) where seed_key is not null;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  list_id uuid not null,
  -- Denormalised so template invariants are declarative rather than trigger-based.
  list_kind text not null,
  title text not null,
  sort_order integer not null,
  completed boolean not null default false,
  assignee_id uuid,
  due_at timestamptz,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  constraint tasks_version_positive check (version > 0),
  constraint tasks_title_length check (private.trimmed_len(title) between 1 and 160),
  constraint tasks_sort_order_non_negative check (sort_order >= 0),
  -- A template task stays unassigned, incomplete and undated.
  constraint tasks_template_runtime_fields_empty check (
    list_kind <> 'template'
    or (assignee_id is null and completed = false and due_at is null)
  ),
  -- Subsumes the contract's (household_id, list_id) -> lists (household_id, id) requirement
  -- and additionally pins the parent kind so the invariant above cannot drift.
  constraint tasks_list_same_household foreign key (household_id, list_id, list_kind)
    references public.lists (household_id, id, kind) on delete cascade,
  -- An assignee must be a member of the same household; active status is re-checked
  -- inside the assigning transaction.
  constraint tasks_assignee_same_household foreign key (household_id, assignee_id)
    references public.memberships (household_id, user_id)
);

create index tasks_list_order on public.tasks (household_id, list_id, completed, sort_order, id);
create index tasks_assigned_incomplete on public.tasks (household_id, assignee_id, due_at, id)
  where completed = false and assignee_id is not null;
create index tasks_unassigned_incomplete on public.tasks (household_id, due_at, id)
  where completed = false and assignee_id is null;
