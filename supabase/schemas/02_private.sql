-- Server-only state. The `private` schema is never exposed through PostgREST.

-- Idempotency receipts: one per (actor, request_id).
create table private.command_receipts (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users (id) on delete cascade,
  household_id uuid,
  request_id uuid not null,
  command text not null,
  payload_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  constraint command_receipts_actor_request_unique unique (actor_id, request_id)
);

create index command_receipts_household on private.command_receipts (household_id, created_at);

-- Raw invitation tokens are never stored. `nonce` plus the server secret
-- deterministically rederives the same link for an idempotent retry;
-- `token_hash` is the lookup key for redemption.
create table private.invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  nonce bytea not null,
  token_hash text not null,
  expires_at timestamptz not null,
  redeemed_by uuid references auth.users (id),
  redeemed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invitations_token_hash_unique unique (token_hash),
  constraint invitations_redemption_consistent check (
    (redeemed_by is null) = (redeemed_at is null)
  )
);

create index invitations_creator on private.invitations (created_by, created_at desc);
create index invitations_household on private.invitations (household_id, created_at desc);

-- Server-clock rate limiting. Counted in a server-controlled store, never client state.
create table private.rate_events (
  id bigserial primary key,
  actor_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now()
);

create index rate_events_actor_kind_time on private.rate_events (actor_id, kind, created_at desc);

-- Server secret used only to rederive invitation tokens. Generated once here and
-- readable exclusively by definer helpers owned by the schema owner.
create table private.server_secrets (
  key text primary key,
  value bytea not null,
  created_at timestamptz not null default now()
);

insert into private.server_secrets (key, value)
values ('invitation_token', extensions.gen_random_bytes(32))
on conflict (key) do nothing;

-- Reviewed, versioned template seed content copied into every new household.
-- Seed keys are stable so a retried create cannot seed duplicates.
create table private.seed_lists (
  seed_key text not null,
  locale text not null,
  title text not null,
  subtitle text,
  sort_order integer not null,
  primary key (seed_key, locale),
  constraint seed_lists_locale_supported check (locale in ('en', 'bg'))
);

create table private.seed_tasks (
  seed_key text not null,
  locale text not null,
  task_key text not null,
  title text not null,
  sort_order integer not null,
  primary key (seed_key, locale, task_key),
  constraint seed_tasks_locale_supported check (locale in ('en', 'bg')),
  constraint seed_tasks_list_exists foreign key (seed_key, locale)
    references private.seed_lists (seed_key, locale) on delete cascade
);
