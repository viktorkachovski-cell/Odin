SET local check_function_bodies = off;

CREATE SCHEMA "private";

CREATE TABLE "private"."command_receipts" (
  "actor_user_id" uuid                     NOT NULL,
  "request_id"    uuid                     NOT NULL,
  "household_id"  uuid,
  "command_name"  text                     NOT NULL,
  "payload_hash"  bytea                    NOT NULL,
  "response"      jsonb                    NOT NULL,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "command_receipts_pkey" PRIMARY KEY (actor_user_id, request_id)
);

CREATE TABLE "private"."invitation_attempts" (
  "actor_user_id" uuid                     NOT NULL,
  "attempted_at"  timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE "private"."invitations" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "household_id" uuid                     NOT NULL,
  "created_by"   uuid                     NOT NULL,
  "token_hash"   bytea                    NOT NULL,
  "expires_at"   timestamp with time zone NOT NULL,
  "redeemed_by"  uuid,
  "redeemed_at"  timestamp with time zone,
  "revoked_at"   timestamp with time zone,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "invitations_expiry_after_creation" CHECK ((expires_at > created_at)),
  CONSTRAINT "invitations_pkey" PRIMARY KEY (id),
  CONSTRAINT "invitations_redemption_pair" CHECK ((((redeemed_by IS NULL) AND (redeemed_at IS NULL)) OR ((redeemed_by IS NOT NULL) AND (redeemed_at IS NOT NULL)))),
  CONSTRAINT "invitations_token_hash_key" UNIQUE (token_hash)
);

CREATE TABLE "private"."seed_lists" (
  "locale"     text    NOT NULL,
  "seed_key"   text    NOT NULL,
  "title"      text    NOT NULL,
  "subtitle"   text,
  "sort_order" integer NOT NULL,
  CONSTRAINT "seed_lists_locale_valid" CHECK ((locale = ANY (ARRAY['en'::text, 'bg'::text]))),
  CONSTRAINT "seed_lists_order_nonnegative" CHECK ((sort_order >= 0)),
  CONSTRAINT "seed_lists_pkey" PRIMARY KEY (LOCALE, seed_key)
);

CREATE TABLE "private"."seed_tasks" (
  "locale"        text    NOT NULL,
  "list_seed_key" text    NOT NULL,
  "task_seed_key" text    NOT NULL,
  "title"         text    NOT NULL,
  "sort_order"    integer NOT NULL,
  CONSTRAINT "seed_tasks_locale_list_seed_key_sort_order_key" UNIQUE (LOCALE, list_seed_key, sort_order),
  CONSTRAINT "seed_tasks_order_nonnegative" CHECK ((sort_order >= 0)),
  CONSTRAINT "seed_tasks_pkey" PRIMARY KEY (LOCALE, list_seed_key, task_seed_key)
);

CREATE TABLE "private"."system_secrets" (
  "name"       text                     NOT NULL,
  "secret"     bytea                    NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "system_secrets_pkey" PRIMARY KEY (name)
);

CREATE TABLE "public"."households" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"        text                     NOT NULL,
  "seed_locale" text                     NOT NULL,
  "created_by"  uuid                     NOT NULL,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "households_id_created_by_key" UNIQUE (id, created_by),
  CONSTRAINT "households_pkey" PRIMARY KEY (id),
  CONSTRAINT "households_seed_locale_valid" CHECK ((seed_locale = ANY (ARRAY['en'::text, 'bg'::text])))
);

ALTER TABLE "public"."households"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."lists" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "household_id" uuid                     NOT NULL,
  "kind"         text                     NOT NULL,
  "title"        text                     NOT NULL,
  "subtitle"     text,
  "status"       text                     NOT NULL DEFAULT 'open'::text,
  "seed_key"     text,
  "created_by"   uuid                     NOT NULL,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "version"      bigint                   NOT NULL DEFAULT 1,
  CONSTRAINT "lists_household_id_id_key" UNIQUE (household_id, id),
  CONSTRAINT "lists_household_id_seed_key_key" UNIQUE (household_id, seed_key),
  CONSTRAINT "lists_kind_valid" CHECK ((kind = ANY (ARRAY['template'::text, 'active'::text]))),
  CONSTRAINT "lists_pkey" PRIMARY KEY (id),
  CONSTRAINT "lists_status_valid" CHECK ((status = ANY (ARRAY['open'::text, 'archived'::text]))),
  CONSTRAINT "lists_template_seed_key" CHECK (((kind = 'active'::text) OR (seed_key IS NOT NULL))),
  CONSTRAINT "lists_version_positive" CHECK ((version > 0))
);

ALTER TABLE "public"."lists"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."memberships" (
  "household_id" uuid                     NOT NULL,
  "user_id"      uuid                     NOT NULL,
  "status"       text                     NOT NULL DEFAULT 'active'::text,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "memberships_pkey" PRIMARY KEY (household_id, user_id),
  CONSTRAINT "memberships_status_valid" CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);

ALTER TABLE "public"."memberships"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."profiles" (
  "user_id"      uuid                     NOT NULL,
  "display_name" text                     NOT NULL,
  "avatar_ref"   text,
  "locale"       text                     NOT NULL DEFAULT 'en'::text,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "profiles_avatar_ref_length" CHECK (((avatar_ref IS NULL) OR (char_length(avatar_ref) <= 500))),
  CONSTRAINT "profiles_locale_valid" CHECK ((locale = ANY (ARRAY['en'::text, 'bg'::text]))),
  CONSTRAINT "profiles_pkey" PRIMARY KEY (user_id)
);

ALTER TABLE "public"."profiles"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."tasks" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "household_id" uuid                     NOT NULL,
  "list_id"      uuid                     NOT NULL,
  "title"        text                     NOT NULL,
  "sort_order"   integer                  NOT NULL,
  "completed"    boolean                  NOT NULL DEFAULT false,
  "assignee_id"  uuid,
  "due_at"       timestamp with time zone,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "version"      bigint                   NOT NULL DEFAULT 1,
  CONSTRAINT "tasks_list_id_sort_order_key" UNIQUE (list_id, sort_order),
  CONSTRAINT "tasks_pkey" PRIMARY KEY (id),
  CONSTRAINT "tasks_sort_order_nonnegative" CHECK ((sort_order >= 0)),
  CONSTRAINT "tasks_version_positive" CHECK ((version > 0))
);

ALTER TABLE "public"."tasks"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.active_household_id (
  target_user_id uuid DEFAULT auth.uid()
)
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select household_id
  from public.memberships
  where user_id = target_user_id and status = 'active'
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION private.claim_task (
  p_request_id       uuid,
  p_task_id          uuid,
  p_expected_version bigint
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
  if v_task.assignee_id is not null then
    return private.error_response('ALREADY_ASSIGNED', 'error.already_assigned', v_task.version);
  end if;

  update public.tasks set assignee_id = v_actor
  where id = p_task_id returning * into v_task;
  v_response := private.ok_response(to_jsonb(v_task));
  perform private.save_command(v_actor, p_request_id, v_household, 'claim_task', v_hash, v_response);
  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION private.command_hash (
  payload jsonb
)
  RETURNS bytea
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select extensions.digest(convert_to(payload::text, 'utf8'), 'sha256');
$function$;

CREATE OR REPLACE FUNCTION private.copy_template (
  p_request_id  uuid,
  p_template_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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

  insert into public.lists (household_id, kind, title, subtitle, created_by)
  values (v_household, 'active', v_source.title, v_source.subtitle, v_actor)
  returning id into v_list_id;

  insert into public.tasks (household_id, list_id, title, sort_order)
  select v_household, v_list_id, title, sort_order
  from public.tasks
  where list_id = p_template_id
  order by sort_order, id;

  v_response := private.ok_response(jsonb_build_object('list_id', v_list_id));
  perform private.save_command(v_actor, p_request_id, v_household, 'copy_template', v_hash, v_response);
  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION private.create_household (
  p_request_id  uuid,
  p_name        text,
  p_seed_locale text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid := auth.uid();
  v_name text := private.normalized_text(p_name);
  v_hash bytea;
  v_replay jsonb;
  v_household uuid;
  v_list uuid;
  v_seed record;
  v_response jsonb;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null then return private.error_response('VALIDATION', 'error.request_id_required'); end if;
  if v_name is null or char_length(v_name) > 160 or p_seed_locale not in ('en', 'bg') then
    return private.error_response('VALIDATION', 'error.household_invalid');
  end if;
  if not exists (select 1 from public.profiles where user_id = v_actor) then
    return private.error_response('VALIDATION', 'error.profile_required');
  end if;

  perform private.lock_command(v_actor, p_request_id);
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text, 0));
  v_hash := private.command_hash(jsonb_build_object('name', v_name, 'seed_locale', p_seed_locale));
  v_replay := private.replay_command(v_actor, p_request_id, 'create_household', v_hash);
  if v_replay is not null then return v_replay; end if;

  if private.active_household_id(v_actor) is not null then
    return private.error_response('ALREADY_IN_HOUSEHOLD', 'error.already_in_household');
  end if;

  insert into public.households (name, seed_locale, created_by)
  values (v_name, p_seed_locale, v_actor)
  returning id into v_household;

  insert into public.memberships (household_id, user_id)
  values (v_household, v_actor);

  for v_seed in
    select * from private.seed_lists
    where locale = p_seed_locale
    order by sort_order, seed_key
  loop
    insert into public.lists (
      household_id, kind, title, subtitle, seed_key, created_by
    ) values (
      v_household, 'template', v_seed.title, v_seed.subtitle, v_seed.seed_key, v_actor
    ) returning id into v_list;

    insert into public.tasks (
      household_id, list_id, title, sort_order
    )
    select v_household, v_list, title, sort_order
    from private.seed_tasks
    where locale = p_seed_locale and list_seed_key = v_seed.seed_key
    order by sort_order, task_seed_key;
  end loop;

  v_response := private.ok_response(jsonb_build_object('household_id', v_household));
  perform private.save_command(
    v_actor, p_request_id, v_household, 'create_household', v_hash, v_response
  );
  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION private.create_invitation (
  p_request_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid := auth.uid();
  v_household uuid;
  v_hash bytea := private.command_hash('{}'::jsonb);
  v_receipt private.command_receipts%rowtype;
  v_invitation private.invitations%rowtype;
  v_invitation_id uuid;
  v_token text;
  v_response jsonb;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null then return private.error_response('VALIDATION', 'error.request_id_required'); end if;
  v_household := private.active_household_id(v_actor);
  if v_household is null then return private.error_response('FORBIDDEN', 'error.household_required'); end if;
  perform private.lock_command(v_actor, p_request_id);
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text, 0));
  if not private.lock_active_members(v_household, array[v_actor]) then
    return private.error_response('FORBIDDEN', 'error.household_required');
  end if;

  select * into v_receipt from private.command_receipts
  where actor_user_id = v_actor and request_id = p_request_id;
  if found then
    if v_receipt.command_name <> 'create_invitation' or v_receipt.payload_hash <> v_hash then
      return private.error_response('IDEMPOTENCY_MISMATCH', 'error.idempotency_mismatch');
    end if;
    if not private.is_active_member(v_receipt.household_id, v_actor) then
      return private.error_response('NOT_FOUND', 'error.not_found');
    end if;
    select * into v_invitation from private.invitations
    where id = (v_receipt.response #>> '{data,invitation_id}')::uuid;
    if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
    v_token := private.invitation_token(v_invitation.id);
    return private.ok_response(jsonb_build_object(
      'invitation_id', v_invitation.id,
      'token', v_token,
      'expires_at', v_invitation.expires_at
    ));
  end if;

  if (select count(*) from private.invitations
      where created_by = v_actor and created_at > now() - interval '1 hour') >= 10 then
    return private.error_response('RATE_LIMITED', 'error.invitation_rate_limited');
  end if;

  v_invitation_id := gen_random_uuid();
  v_token := private.invitation_token(v_invitation_id);
  insert into private.invitations (id, household_id, created_by, token_hash, expires_at)
  values (
    v_invitation_id,
    v_household,
    v_actor,
    extensions.digest(convert_to(v_token, 'utf8'), 'sha256'),
    now() + interval '72 hours'
  ) returning * into v_invitation;

  v_response := private.ok_response(jsonb_build_object(
    'invitation_id', v_invitation.id,
    'expires_at', v_invitation.expires_at
  ));
  perform private.save_command(
    v_actor, p_request_id, v_household, 'create_invitation', v_hash, v_response
  );
  return private.ok_response(jsonb_build_object(
    'invitation_id', v_invitation.id,
    'token', v_token,
    'expires_at', v_invitation.expires_at
  ));
end;
$function$;

CREATE OR REPLACE FUNCTION private.create_list (
  p_request_id uuid,
  p_title      text,
  p_subtitle   text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid := auth.uid();
  v_household uuid;
  v_title text := private.normalized_text(p_title);
  v_subtitle text := private.normalized_text(p_subtitle);
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
    or (v_subtitle is not null and char_length(v_subtitle) > 300) then
    return private.error_response('VALIDATION', 'error.list_invalid');
  end if;

  perform private.lock_command(v_actor, p_request_id);
  if not private.lock_active_members(v_household, array[v_actor]) then
    return private.error_response('FORBIDDEN', 'error.household_required');
  end if;
  v_hash := private.command_hash(jsonb_build_object('title', v_title, 'subtitle', v_subtitle));
  v_replay := private.replay_command(v_actor, p_request_id, 'create_list', v_hash);
  if v_replay is not null then return v_replay; end if;

  insert into public.lists (household_id, kind, title, subtitle, created_by)
  values (v_household, 'active', v_title, v_subtitle, v_actor)
  returning * into v_list;

  v_response := private.ok_response(to_jsonb(v_list));
  perform private.save_command(v_actor, p_request_id, v_household, 'create_list', v_hash, v_response);
  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION private.create_task (
  p_request_id  uuid,
  p_list_id     uuid,
  p_title       text,
  p_assignee_id uuid                     DEFAULT NULL::uuid,
  p_due_at      timestamp with time zone DEFAULT NULL::timestamp WITH time zone
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid := auth.uid();
  v_household uuid;
  v_title text := private.normalized_text(p_title);
  v_hash bytea;
  v_replay jsonb;
  v_task public.tasks%rowtype;
  v_order integer;
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

  perform 1 from public.lists
  where id = p_list_id and household_id = v_household and kind = 'active' and status = 'open'
  for update;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  if p_assignee_id is not null and not private.is_active_member(v_household, p_assignee_id) then
    return private.error_response('VALIDATION', 'error.assignee_invalid');
  end if;
  select coalesce(max(sort_order), -1) + 1 into v_order
  from public.tasks where list_id = p_list_id;

  insert into public.tasks (household_id, list_id, title, sort_order, assignee_id, due_at)
  values (v_household, p_list_id, v_title, v_order, p_assignee_id, p_due_at)
  returning * into v_task;
  v_response := private.ok_response(to_jsonb(v_task));
  perform private.save_command(v_actor, p_request_id, v_household, 'create_task', v_hash, v_response);
  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION private.decode_cursor (
  value text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  padded text;
begin
  if value is null then return null; end if;
  padded := translate(value, '-_', '+/');
  padded := padded || repeat('=', (4 - length(padded) % 4) % 4);
  return convert_from(decode(padded, 'base64'), 'utf8')::jsonb;
exception when others then
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION private.encode_cursor (
  value jsonb
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select rtrim(translate(encode(convert_to(value::text, 'utf8'), 'base64'), '+/', '-_'), '=');
$function$;

CREATE OR REPLACE FUNCTION private.error_response (
  error_code      text,
  message_key     text,
  current_version bigint DEFAULT NULL::bigint
)
  RETURNS jsonb
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select jsonb_build_object(
    'ok', false,
    'error', jsonb_strip_nulls(jsonb_build_object(
      'code', error_code,
      'message_key', message_key,
      'current_version', current_version
    ))
  );
$function$;

CREATE OR REPLACE FUNCTION private.get_cross_list_tasks (
  mode     text,
  p_cursor text    DEFAULT NULL::text,
  p_limit  integer DEFAULT 50
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
    select t.id as task_id, t.title, t.due_at, t.version, t.list_id,
      l.title as list_title, (t.due_at is null) as has_no_due,
      coalesce(t.due_at, 'infinity'::timestamptz) as sort_due
    from public.tasks t
    join public.lists l on l.id = t.list_id and l.household_id = t.household_id
    where t.household_id = v_household and not t.completed
      and l.kind = 'active' and l.status = 'open'
      and ((mode = 'mine' and t.assignee_id = v_actor)
        or (mode = 'unassigned' and t.assignee_id is null))
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
      and ((mode = 'mine' and t.assignee_id = v_actor)
        or (mode = 'unassigned' and t.assignee_id is null))
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
      and ((mode = 'mine' and t.assignee_id = v_actor)
        or (mode = 'unassigned' and t.assignee_id is null))
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
$function$;

CREATE OR REPLACE FUNCTION private.get_members()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select case
    when auth.uid() is null then private.error_response('UNAUTHENTICATED', 'error.unauthenticated')
    when private.active_household_id() is null then private.error_response('NOT_FOUND', 'error.household_required')
    else private.ok_response(coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'display_name', p.display_name,
        'avatar_ref', p.avatar_ref
      ) order by p.display_name, m.user_id)
      from public.memberships m
      join public.profiles p on p.user_id = m.user_id
      where m.household_id = private.active_household_id()
        and m.status = 'active'
    ), '[]'::jsonb))
  end;
$function$;

CREATE OR REPLACE FUNCTION private.invitation_secret()
  RETURNS bytea
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION private.invitation_token (
  invitation_id uuid
)
  RETURNS text
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION private.is_active_member (
  target_household_id uuid,
  target_user_id      uuid DEFAULT auth.uid()
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select target_user_id is not null and exists (
    select 1
    from public.memberships
    where household_id = target_household_id
      and user_id = target_user_id
      and status = 'active'
  );
$function$;

CREATE OR REPLACE FUNCTION private.lock_active_members (
  p_household_id uuid,
  p_user_ids     uuid[]
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION private.lock_command (
  p_actor_id   uuid,
  p_request_id uuid
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select pg_advisory_xact_lock(
    hashtextextended(p_actor_id::text || ':' || p_request_id::text, 1)
  );
$function$;

CREATE OR REPLACE FUNCTION private.normalized_text (
  value text
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select nullif(btrim(translate(value, chr(160) || chr(8239) || chr(12288), '   ')), '');
$function$;

CREATE OR REPLACE FUNCTION private.ok_response (
  data jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select jsonb_build_object('ok', true, 'data', data);
$function$;

CREATE OR REPLACE FUNCTION private.redeem_invitation (
  p_request_id uuid,
  p_token      text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid := auth.uid();
  v_token_hash bytea;
  v_hash bytea;
  v_replay jsonb;
  v_invitation private.invitations%rowtype;
  v_response jsonb;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null then return private.error_response('VALIDATION', 'error.request_id_required'); end if;
  if p_token is null or char_length(p_token) < 40 or char_length(p_token) > 100 then
    return private.error_response('VALIDATION', 'error.invitation_invalid');
  end if;
  perform private.lock_command(v_actor, p_request_id);
  perform pg_advisory_xact_lock(hashtextextended(v_actor::text, 0));
  v_token_hash := extensions.digest(convert_to(p_token, 'utf8'), 'sha256');
  v_hash := private.command_hash(jsonb_build_object('token_hash', encode(v_token_hash, 'hex')));
  v_replay := private.replay_command(v_actor, p_request_id, 'redeem_invitation', v_hash);
  if v_replay is not null then return v_replay; end if;
  if private.active_household_id(v_actor) is not null then
    return private.error_response('ALREADY_IN_HOUSEHOLD', 'error.already_in_household');
  end if;

  if (select count(*) from private.invitation_attempts
      where actor_user_id = v_actor and attempted_at > now() - interval '15 minutes') >= 10 then
    return private.error_response('RATE_LIMITED', 'error.invitation_rate_limited');
  end if;

  select * into v_invitation from private.invitations
  where token_hash = v_token_hash for update;
  if not found then
    insert into private.invitation_attempts (actor_user_id) values (v_actor);
    return private.error_response('NOT_FOUND', 'error.invitation_invalid');
  end if;
  if v_invitation.revoked_at is not null then
    insert into private.invitation_attempts (actor_user_id) values (v_actor);
    return private.error_response('INVITE_REVOKED', 'error.invitation_revoked');
  end if;
  if v_invitation.redeemed_at is not null then
    insert into private.invitation_attempts (actor_user_id) values (v_actor);
    return private.error_response('INVITE_USED', 'error.invitation_used');
  end if;
  if v_invitation.expires_at <= now() then
    insert into private.invitation_attempts (actor_user_id) values (v_actor);
    return private.error_response('INVITE_EXPIRED', 'error.invitation_expired');
  end if;

  insert into public.memberships (household_id, user_id)
  values (v_invitation.household_id, v_actor);
  update private.invitations set redeemed_by = v_actor, redeemed_at = statement_timestamp()
  where id = v_invitation.id;
  v_response := private.ok_response(jsonb_build_object('household_id', v_invitation.household_id));
  perform private.save_command(
    v_actor, p_request_id, v_invitation.household_id, 'redeem_invitation', v_hash, v_response
  );
  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION private.replay_command (
  p_actor_id     uuid,
  p_request_id   uuid,
  p_command_name text,
  p_payload_hash bytea
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION private.revoke_invitation (
  p_request_id    uuid,
  p_invitation_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid := auth.uid();
  v_household uuid;
  v_hash bytea;
  v_replay jsonb;
  v_invitation private.invitations%rowtype;
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
  v_hash := private.command_hash(jsonb_build_object('invitation_id', p_invitation_id));
  v_replay := private.replay_command(v_actor, p_request_id, 'revoke_invitation', v_hash);
  if v_replay is not null then return v_replay; end if;

  select * into v_invitation from private.invitations
  where id = p_invitation_id and household_id = v_household and created_by = v_actor
  for update;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  if v_invitation.redeemed_at is not null then
    return private.error_response('INVITE_USED', 'error.invitation_used');
  end if;
  update private.invitations set revoked_at = coalesce(revoked_at, statement_timestamp())
  where id = p_invitation_id returning * into v_invitation;
  v_response := private.ok_response(jsonb_build_object('invitation_id', v_invitation.id));
  perform private.save_command(
    v_actor, p_request_id, v_household, 'revoke_invitation', v_hash, v_response
  );
  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION private.save_command (
  actor_id     uuid,
  request_id   uuid,
  household_id uuid,
  command_name text,
  payload_hash bytea,
  response     jsonb
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  insert into private.command_receipts (
    actor_user_id, request_id, household_id, command_name, payload_hash, response
  ) values (
    actor_id, request_id, household_id, command_name, payload_hash, response
  );
$function$;

CREATE OR REPLACE FUNCTION private.set_task_completed (
  p_request_id       uuid,
  p_task_id          uuid,
  p_expected_version bigint,
  p_completed        boolean
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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

  select t.* into v_task from public.tasks t
  join public.lists l on l.id = t.list_id and l.household_id = t.household_id
  where t.id = p_task_id and t.household_id = v_household
    and l.kind = 'active' and l.status = 'open'
  for update of t;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  if v_task.version <> p_expected_version then
    return private.error_response('CONFLICT', 'error.conflict', v_task.version);
  end if;

  update public.tasks set completed = p_completed
  where id = p_task_id returning * into v_task;
  v_response := private.ok_response(to_jsonb(v_task));
  perform private.save_command(
    v_actor, p_request_id, v_household, 'set_task_completed', v_hash, v_response
  );
  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION private.touch_membership()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.touch_versioned_row()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.updated_at := statement_timestamp();
  new.version := old.version + 1;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.update_list (
  p_request_id       uuid,
  p_list_id          uuid,
  p_expected_version bigint,
  p_title            text,
  p_subtitle         text   DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid := auth.uid();
  v_household uuid;
  v_title text := private.normalized_text(p_title);
  v_subtitle text := private.normalized_text(p_subtitle);
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
    or (v_subtitle is not null and char_length(v_subtitle) > 300) then
    return private.error_response('VALIDATION', 'error.list_invalid');
  end if;

  perform private.lock_command(v_actor, p_request_id);
  if not private.lock_active_members(v_household, array[v_actor]) then
    return private.error_response('FORBIDDEN', 'error.household_required');
  end if;
  v_hash := private.command_hash(jsonb_build_object(
    'list_id', p_list_id, 'expected_version', p_expected_version,
    'title', v_title, 'subtitle', v_subtitle
  ));
  v_replay := private.replay_command(v_actor, p_request_id, 'update_list', v_hash);
  if v_replay is not null then return v_replay; end if;

  select * into v_list from public.lists
  where id = p_list_id and household_id = v_household and kind = 'active' and status = 'open'
  for update;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  if v_list.version <> p_expected_version then
    return private.error_response('CONFLICT', 'error.conflict', v_list.version);
  end if;

  update public.lists set title = v_title, subtitle = v_subtitle
  where id = p_list_id returning * into v_list;
  v_response := private.ok_response(to_jsonb(v_list));
  perform private.save_command(v_actor, p_request_id, v_household, 'update_list', v_hash, v_response);
  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION private.update_profile (
  p_request_id   uuid,
  p_display_name text,
  p_locale       text,
  p_avatar_ref   text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid := auth.uid();
  v_name text := private.normalized_text(p_display_name);
  v_avatar text := private.normalized_text(p_avatar_ref);
  v_hash bytea;
  v_replay jsonb;
  v_response jsonb;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null then return private.error_response('VALIDATION', 'error.request_id_required'); end if;
  if v_name is null or char_length(v_name) > 80 or p_locale not in ('en', 'bg') then
    return private.error_response('VALIDATION', 'error.profile_invalid');
  end if;
  if v_avatar is not null and char_length(v_avatar) > 500 then
    return private.error_response('VALIDATION', 'error.avatar_invalid');
  end if;

  perform private.lock_command(v_actor, p_request_id);
  v_hash := private.command_hash(jsonb_build_object(
    'display_name', v_name, 'locale', p_locale, 'avatar_ref', v_avatar
  ));
  v_replay := private.replay_command(v_actor, p_request_id, 'update_profile', v_hash);
  if v_replay is not null then return v_replay; end if;

  insert into public.profiles (user_id, display_name, locale, avatar_ref)
  values (v_actor, v_name, p_locale, v_avatar)
  on conflict (user_id) do update set
    display_name = excluded.display_name,
    locale = excluded.locale,
    avatar_ref = excluded.avatar_ref,
    updated_at = statement_timestamp();

  select private.ok_response(to_jsonb(p)) into v_response
  from public.profiles p where user_id = v_actor;
  perform private.save_command(v_actor, p_request_id, null, 'update_profile', v_hash, v_response);
  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION private.update_task (
  p_request_id       uuid,
  p_task_id          uuid,
  p_expected_version bigint,
  p_title            text,
  p_assignee_id      uuid                     DEFAULT NULL::uuid,
  p_due_at           timestamp with time zone DEFAULT NULL::timestamp WITH time zone
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_actor uuid := auth.uid();
  v_household uuid;
  v_title text := private.normalized_text(p_title);
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

  update public.tasks set title = v_title, assignee_id = p_assignee_id, due_at = p_due_at
  where id = p_task_id returning * into v_task;
  v_response := private.ok_response(to_jsonb(v_task));
  perform private.save_command(v_actor, p_request_id, v_household, 'update_task', v_hash, v_response);
  return v_response;
end;
$function$;

CREATE OR REPLACE FUNCTION private.validate_task_parent_and_assignee()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.claim_task (
  request_id       uuid,
  task_id          uuid,
  expected_version bigint
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.claim_task(request_id, task_id, expected_version); $function$;

CREATE OR REPLACE FUNCTION public.copy_template (
  request_id  uuid,
  template_id uuid
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.copy_template(request_id, template_id); $function$;

CREATE OR REPLACE FUNCTION public.create_household (
  request_id  uuid,
  name        text,
  seed_locale text
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.create_household(request_id, name, seed_locale); $function$;

CREATE OR REPLACE FUNCTION public.create_invitation (
  request_id uuid
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.create_invitation(request_id); $function$;

CREATE OR REPLACE FUNCTION public.create_list (
  request_id uuid,
  title      text,
  subtitle   text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.create_list(request_id, title, subtitle); $function$;

CREATE OR REPLACE FUNCTION public.create_task (
  request_id  uuid,
  list_id     uuid,
  title       text,
  assignee_id uuid                     DEFAULT NULL::uuid,
  due_at      timestamp with time zone DEFAULT NULL::timestamp WITH time zone
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.create_task(request_id, list_id, title, assignee_id, due_at); $function$;

CREATE OR REPLACE FUNCTION public.get_home (
  p_cursor text    DEFAULT NULL::text,
  p_limit  integer DEFAULT 50
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
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
    select l.id, l.kind, l.title, l.subtitle, l.status, l.version,
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
$function$;

CREATE OR REPLACE FUNCTION public.get_list (
  p_list_id uuid,
  p_cursor  text    DEFAULT NULL::text,
  p_limit   integer DEFAULT 50
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
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
  select coalesce(jsonb_agg(to_jsonb(visible) order by completed, sort_order, id), '[]'::jsonb)
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
$function$;

CREATE OR REPLACE FUNCTION public.get_members()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$ select private.get_members(); $function$;

CREATE OR REPLACE FUNCTION public.get_my_household()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select coalesce(
    private.ok_response(to_jsonb(h)),
    private.error_response('NOT_FOUND', 'error.household_required')
  )
  from (select private.active_household_id() as id) active
  left join public.households h on h.id = active.id;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_tasks (
  p_cursor text    DEFAULT NULL::text,
  p_limit  integer DEFAULT 50
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$ select private.get_cross_list_tasks('mine', p_cursor, p_limit); $function$;

CREATE OR REPLACE FUNCTION public.get_unassigned (
  p_cursor text    DEFAULT NULL::text,
  p_limit  integer DEFAULT 50
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$ select private.get_cross_list_tasks('unassigned', p_cursor, p_limit); $function$;

CREATE OR REPLACE FUNCTION public.redeem_invitation (
  request_id uuid,
  token      text
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.redeem_invitation(request_id, token); $function$;

CREATE OR REPLACE FUNCTION public.revoke_invitation (
  request_id    uuid,
  invitation_id uuid
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.revoke_invitation(request_id, invitation_id); $function$;

CREATE OR REPLACE FUNCTION public.set_task_completed (
  request_id       uuid,
  task_id          uuid,
  expected_version bigint,
  completed        boolean
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.set_task_completed(request_id, task_id, expected_version, completed); $function$;

CREATE OR REPLACE FUNCTION public.update_list (
  request_id       uuid,
  list_id          uuid,
  expected_version bigint,
  title            text,
  subtitle         text   DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.update_list(request_id, list_id, expected_version, title, subtitle); $function$;

CREATE OR REPLACE FUNCTION public.update_profile (
  request_id   uuid,
  display_name text,
  locale       text,
  avatar_ref   text DEFAULT NULL::text
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.update_profile(request_id, display_name, locale, avatar_ref); $function$;

CREATE OR REPLACE FUNCTION public.update_task (
  request_id       uuid,
  task_id          uuid,
  expected_version bigint,
  title            text,
  assignee_id      uuid                     DEFAULT NULL::uuid,
  due_at           timestamp with time zone DEFAULT NULL::timestamp WITH time zone
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.update_task(request_id, task_id, expected_version, title, assignee_id, due_at); $function$;

ALTER TABLE "private"."command_receipts"
  ADD CONSTRAINT "command_receipts_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "private"."invitation_attempts"
  ADD CONSTRAINT "invitation_attempts_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "private"."invitations"
  ADD CONSTRAINT "invitations_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "private"."invitations"
  ADD CONSTRAINT "invitations_redeemed_by_fkey" FOREIGN KEY (redeemed_by) REFERENCES auth.users(id);

ALTER TABLE "private"."seed_tasks"
  ADD CONSTRAINT "seed_tasks_locale_list_seed_key_fkey" FOREIGN KEY (LOCALE, list_seed_key) REFERENCES private.seed_lists(LOCALE, seed_key) ON DELETE CASCADE;

ALTER TABLE "public"."households"
  ADD CONSTRAINT "households_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "private"."command_receipts"
  ADD CONSTRAINT "command_receipts_household_id_fkey" FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

ALTER TABLE "private"."invitations"
  ADD CONSTRAINT "invitations_household_id_fkey" FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

ALTER TABLE "public"."lists"
  ADD CONSTRAINT "lists_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE "public"."lists"
  ADD CONSTRAINT "lists_household_id_fkey" FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

ALTER TABLE "public"."memberships"
  ADD CONSTRAINT "memberships_household_id_fkey" FOREIGN KEY (household_id) REFERENCES public.households(id) ON DELETE CASCADE;

ALTER TABLE "public"."memberships"
  ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."tasks"
  ADD CONSTRAINT "tasks_assignee_membership_fk" FOREIGN KEY (household_id, assignee_id) REFERENCES public.memberships(household_id, user_id);

ALTER TABLE "public"."tasks"
  ADD CONSTRAINT "tasks_list_fk" FOREIGN KEY (household_id, list_id) REFERENCES public.lists(household_id, id) ON DELETE CASCADE;

CREATE INDEX command_receipts_household_created_idx ON private.command_receipts USING btree (household_id, created_at);

CREATE INDEX invitation_attempts_actor_time_idx ON private.invitation_attempts USING btree (actor_user_id, attempted_at DESC);

CREATE INDEX invitations_creator_rate_limit_idx ON private.invitations USING btree (created_by, created_at DESC);

CREATE INDEX invitations_household_created_idx ON private.invitations USING btree (household_id, created_at DESC);

CREATE INDEX lists_household_kind_status_id_idx ON public.lists USING btree (household_id, kind, status, id);

CREATE INDEX memberships_active_household_user_idx ON public.memberships USING btree (household_id, user_id)
  WHERE (status = 'active'::text);

CREATE UNIQUE INDEX memberships_one_active_household_per_user_idx ON public.memberships USING btree (user_id)
  WHERE (status = 'active'::text);

CREATE INDEX tasks_household_list_completed_order_idx ON public.tasks USING btree (household_id, list_id, completed, sort_order, id);

CREATE INDEX tasks_incomplete_assignee_due_idx ON public.tasks USING btree (household_id, assignee_id, due_at, list_id, id)
  WHERE (completed = false);

CREATE INDEX tasks_incomplete_unassigned_due_idx ON public.tasks USING btree (household_id, due_at, list_id, id)
  WHERE ((completed = false) AND (assignee_id IS NULL));

CREATE TRIGGER lists_touch_version
  BEFORE UPDATE ON public.lists
  FOR EACH ROW
  EXECUTE FUNCTION private.touch_versioned_row();

CREATE TRIGGER memberships_touch_updated_at
  BEFORE UPDATE ON public.memberships
  FOR EACH ROW
  EXECUTE FUNCTION private.touch_membership();

CREATE TRIGGER tasks_touch_version
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION private.touch_versioned_row();

CREATE TRIGGER tasks_validate_parent_and_assignee
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION private.validate_task_parent_and_assignee();

CREATE POLICY "households_select_member" ON "public"."households"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT private.is_active_member(households.id) AS is_active_member));

CREATE POLICY "lists_select_household" ON "public"."lists"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT private.is_active_member(lists.household_id) AS is_active_member));

CREATE POLICY "memberships_select_household" ON "public"."memberships"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT private.is_active_member(memberships.household_id) AS is_active_member));

CREATE POLICY "profiles_select_self" ON "public"."profiles"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "tasks_select_household" ON "public"."tasks"
  FOR SELECT
  TO "authenticated"
  USING (( SELECT private.is_active_member(tasks.household_id) AS is_active_member));

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."lists";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."memberships";

ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."tasks";

REVOKE ALL ON FUNCTION "private"."active_household_id"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."active_household_id"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."claim_task"(uuid, uuid, bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."claim_task"(uuid, uuid, bigint) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."command_hash"(jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."command_hash"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "private"."copy_template"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."copy_template"(uuid, uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."create_household"(uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."create_household"(uuid, text, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."create_invitation"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."create_invitation"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."create_list"(uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."create_list"(uuid, text, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."create_task"(uuid, uuid, text, uuid, timestamp WITH time zone) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."create_task"(uuid, uuid, text, uuid, timestamp WITH time zone) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."decode_cursor"(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."decode_cursor"(text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."encode_cursor"(jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."encode_cursor"(jsonb) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."error_response"(text, text, bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."error_response"(text, text, bigint) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."get_cross_list_tasks"(text, text, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."get_cross_list_tasks"(text, text, integer) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."get_members"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."get_members"() TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."invitation_secret"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."invitation_secret"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."invitation_token"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."invitation_token"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."is_active_member"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."is_active_member"(uuid, uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."lock_active_members"(uuid, uuid[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."lock_active_members"(uuid, uuid[]) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."lock_command"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."lock_command"(uuid, uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."normalized_text"(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."normalized_text"(text) TO "postgres";

REVOKE ALL ON FUNCTION "private"."ok_response"(jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."ok_response"(jsonb) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."redeem_invitation"(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."redeem_invitation"(uuid, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."replay_command"(uuid, uuid, text, bytea) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."replay_command"(uuid, uuid, text, bytea) TO "postgres";

REVOKE ALL ON FUNCTION "private"."revoke_invitation"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."revoke_invitation"(uuid, uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."save_command"(uuid, uuid, uuid, text, bytea, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."save_command"(uuid, uuid, uuid, text, bytea, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "private"."set_task_completed"(uuid, uuid, bigint, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."set_task_completed"(uuid, uuid, bigint, boolean) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."touch_membership"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."touch_membership"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."touch_versioned_row"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."touch_versioned_row"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."update_list"(uuid, uuid, bigint, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."update_list"(uuid, uuid, bigint, text, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."update_profile"(uuid, text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."update_profile"(uuid, text, text, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."update_task"(uuid, uuid, bigint, text, uuid, timestamp WITH time zone) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."update_task"(uuid, uuid, bigint, text, uuid, timestamp WITH time zone) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."validate_task_parent_and_assignee"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."validate_task_parent_and_assignee"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."claim_task"(uuid, uuid, bigint) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."claim_task"(uuid, uuid, bigint) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."copy_template"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."copy_template"(uuid, uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."create_household"(uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."create_household"(uuid, text, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."create_invitation"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."create_invitation"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."create_list"(uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."create_list"(uuid, text, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."create_task"(uuid, uuid, text, uuid, timestamp WITH time zone) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."create_task"(uuid, uuid, text, uuid, timestamp WITH time zone) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."get_home"(text, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_home"(text, integer) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."get_list"(uuid, text, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_list"(uuid, text, integer) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."get_members"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_members"() TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."get_my_household"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_my_household"() TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."get_my_tasks"(text, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_my_tasks"(text, integer) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."get_unassigned"(text, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_unassigned"(text, integer) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."redeem_invitation"(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."redeem_invitation"(uuid, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."revoke_invitation"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."revoke_invitation"(uuid, uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."set_task_completed"(uuid, uuid, bigint, boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."set_task_completed"(uuid, uuid, bigint, boolean) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."update_list"(uuid, uuid, bigint, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."update_list"(uuid, uuid, bigint, text, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."update_profile"(uuid, text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."update_profile"(uuid, text, text, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."update_task"(uuid, uuid, bigint, text, uuid, timestamp WITH time zone) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."update_task"(uuid, uuid, bigint, text, uuid, timestamp WITH time zone) TO "authenticated", "postgres";

GRANT USAGE ON SCHEMA "private" TO "authenticated";

GRANT CREATE, USAGE ON SCHEMA "private" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."command_receipts" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."invitation_attempts" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."invitations" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."seed_lists" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."seed_tasks" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."system_secrets" TO "postgres";

REVOKE ALL ON TABLE "public"."households" FROM "authenticated";

GRANT SELECT ON TABLE "public"."households" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."households" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."households" TO "service_role";

REVOKE ALL ON TABLE "public"."lists" FROM "authenticated";

GRANT SELECT ON TABLE "public"."lists" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."lists" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."lists" TO "service_role";

REVOKE ALL ON TABLE "public"."memberships" FROM "authenticated";

GRANT SELECT ON TABLE "public"."memberships" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."memberships" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."memberships" TO "service_role";

REVOKE ALL ON TABLE "public"."profiles" FROM "authenticated";

GRANT SELECT ON TABLE "public"."profiles" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."profiles" TO "service_role";

REVOKE ALL ON TABLE "public"."tasks" FROM "authenticated";

GRANT SELECT ON TABLE "public"."tasks" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tasks" TO "postgres";

GRANT MAINTAIN, REFERENCES, TRIGGER, TRUNCATE ON TABLE "public"."tasks" TO "service_role";

ALTER TABLE "public"."households"
  ADD CONSTRAINT "households_name_normalized" CHECK (((name = private.normalized_text(name)) AND ((char_length(name) >= 1) AND (char_length(name) <= 160))));

ALTER TABLE "public"."lists"
  ADD CONSTRAINT "lists_subtitle_normalized" CHECK (((subtitle IS NULL) OR ((subtitle = private.normalized_text(subtitle)) AND (char_length(subtitle) <= 300))));

ALTER TABLE "public"."lists"
  ADD CONSTRAINT "lists_title_normalized" CHECK (((title = private.normalized_text(title)) AND ((char_length(title) >= 1) AND (char_length(title) <= 160))));

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_display_name_normalized"
    CHECK (((display_name = private.normalized_text(display_name)) AND ((char_length(display_name) >= 1) AND (char_length(display_name) <= 80))));

ALTER TABLE "public"."tasks"
  ADD CONSTRAINT "tasks_title_normalized" CHECK (((title = private.normalized_text(title)) AND ((char_length(title) >= 1) AND (char_length(title) <= 160))));
