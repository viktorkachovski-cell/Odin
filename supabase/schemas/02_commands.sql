create or replace function private.update_profile(
  p_request_id uuid,
  p_display_name text,
  p_locale text,
  p_avatar_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function private.create_household(
  p_request_id uuid,
  p_name text,
  p_seed_locale text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function private.create_list(
  p_request_id uuid,
  p_title text,
  p_subtitle text default null
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
$$;

create or replace function private.update_list(
  p_request_id uuid,
  p_list_id uuid,
  p_expected_version bigint,
  p_title text,
  p_subtitle text default null
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
  if v_task.assignee_id is not null then
    return private.error_response('ALREADY_ASSIGNED', 'error.already_assigned', v_task.version);
  end if;

  update public.tasks set assignee_id = v_actor
  where id = p_task_id returning * into v_task;
  v_response := private.ok_response(to_jsonb(v_task));
  perform private.save_command(v_actor, p_request_id, v_household, 'claim_task', v_hash, v_response);
  return v_response;
end;
$$;

create or replace function private.create_invitation(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function private.redeem_invitation(p_request_id uuid, p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

create or replace function private.revoke_invitation(p_request_id uuid, p_invitation_id uuid)
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
$$;

create or replace function public.update_profile(
  request_id uuid, display_name text, locale text, avatar_ref text default null
) returns jsonb language sql security invoker set search_path = ''
as $$ select private.update_profile(request_id, display_name, locale, avatar_ref); $$;

create or replace function public.create_household(
  request_id uuid, name text, seed_locale text
) returns jsonb language sql security invoker set search_path = ''
as $$ select private.create_household(request_id, name, seed_locale); $$;

create or replace function public.create_list(
  request_id uuid, title text, subtitle text default null
) returns jsonb language sql security invoker set search_path = ''
as $$ select private.create_list(request_id, title, subtitle); $$;

create or replace function public.update_list(
  request_id uuid, list_id uuid, expected_version bigint, title text, subtitle text default null
) returns jsonb language sql security invoker set search_path = ''
as $$ select private.update_list(request_id, list_id, expected_version, title, subtitle); $$;

create or replace function public.copy_template(request_id uuid, template_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.copy_template(request_id, template_id); $$;

create or replace function public.create_task(
  request_id uuid, list_id uuid, title text,
  assignee_id uuid default null, due_at timestamptz default null
) returns jsonb language sql security invoker set search_path = ''
as $$ select private.create_task(request_id, list_id, title, assignee_id, due_at); $$;

create or replace function public.update_task(
  request_id uuid, task_id uuid, expected_version bigint, title text,
  assignee_id uuid default null, due_at timestamptz default null
) returns jsonb language sql security invoker set search_path = ''
as $$ select private.update_task(request_id, task_id, expected_version, title, assignee_id, due_at); $$;

create or replace function public.set_task_completed(
  request_id uuid, task_id uuid, expected_version bigint, completed boolean
) returns jsonb language sql security invoker set search_path = ''
as $$ select private.set_task_completed(request_id, task_id, expected_version, completed); $$;

create or replace function public.claim_task(
  request_id uuid, task_id uuid, expected_version bigint
) returns jsonb language sql security invoker set search_path = ''
as $$ select private.claim_task(request_id, task_id, expected_version); $$;

create or replace function public.create_invitation(request_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.create_invitation(request_id); $$;

create or replace function public.redeem_invitation(request_id uuid, token text)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.redeem_invitation(request_id, token); $$;

create or replace function public.revoke_invitation(request_id uuid, invitation_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.revoke_invitation(request_id, invitation_id); $$;
