-- Onboarding commands.

-- Serialization key for "one active household per account". Taken before any
-- membership row is read or written, including when no row exists yet.
create or replace function private.lock_user(p_user uuid)
returns void language sql set search_path = ''
as $$ select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('odin.user:' || p_user::text, 0)) $$;

create or replace function private.seed_household(
  p_household uuid, p_actor uuid, p_locale text
) returns void language plpgsql security definer set search_path = ''
as $$
declare v_seed record; v_list_id uuid;
begin
  for v_seed in
    select * from private.seed_lists s where s.locale = p_locale order by s.sort_order, s.seed_key
  loop
    insert into public.lists
      (household_id, kind, title, subtitle, status, seed_key, created_by)
    values
      (p_household, 'template', v_seed.title, v_seed.subtitle, 'open', v_seed.seed_key, p_actor)
    returning id into v_list_id;

    insert into public.tasks
      (household_id, list_id, list_kind, title, sort_order, created_by)
    select p_household, v_list_id, 'template', t.title, t.sort_order, p_actor
    from private.seed_tasks t
    where t.seed_key = v_seed.seed_key and t.locale = p_locale
    order by t.sort_order, t.task_key;
  end loop;
end;
$$;

create or replace function private.cmd_create_household(
  p_request_id uuid, p_name text, p_seed_locale text
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_name text;
  v_payload jsonb;
  v_hash text;
  v_result jsonb;
  v_household uuid;
  v_constraint text;
begin
  v_name := private.require_text(p_name, 'name', 1, 80, true);
  if p_seed_locale not in ('en', 'bg') then
    perform private.fail('VALIDATION', 'validation.seed_locale.unsupported');
  end if;

  v_payload := jsonb_build_object('name', v_name, 'seed_locale', p_seed_locale);
  v_hash := private.payload_hash('create_household', v_payload);
  v_result := private.replay(v_actor, p_request_id, v_hash);
  if v_result is not null then return private.ok(v_result); end if;

  perform private.lock_user(v_actor);
  if exists (
    select 1 from public.memberships m where m.user_id = v_actor and m.status = 'active'
  ) then
    perform private.fail('ALREADY_IN_HOUSEHOLD');
  end if;

  begin
    insert into public.households (name, seed_locale, created_by)
    values (v_name, p_seed_locale, v_actor) returning id into v_household;

    insert into public.memberships (household_id, user_id, status)
    values (v_household, v_actor, 'active');

    perform private.seed_household(v_household, v_actor, p_seed_locale);

    v_result := jsonb_build_object('household_id', v_household);
    perform private.record_receipt(
      v_actor, v_household, p_request_id, 'create_household', v_hash, v_result);
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'command_receipts_actor_request_unique' then
      -- A concurrent identical request committed first; return its result.
      v_result := private.replay(v_actor, p_request_id, v_hash);
      if v_result is null then perform private.fail('CONFLICT'); end if;
    elsif v_constraint = 'memberships_single_active_household' then
      perform private.fail('ALREADY_IN_HOUSEHOLD');
    else
      raise;
    end if;
  end;

  return private.ok(v_result);
end;
$$;

create or replace function private.cmd_update_profile(
  p_request_id uuid, p_display_name text, p_locale text, p_avatar_ref text
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_name text;
  v_avatar text;
  v_payload jsonb;
  v_hash text;
  v_result jsonb;
  v_constraint text;
  v_profile public.profiles;
begin
  v_name := private.require_text(p_display_name, 'display_name', 1, 80, true);
  v_avatar := private.require_text(p_avatar_ref, 'avatar_ref', 1, 256, false);
  if p_locale not in ('en', 'bg') then
    perform private.fail('VALIDATION', 'validation.locale.unsupported');
  end if;

  v_payload := jsonb_build_object(
    'display_name', v_name, 'locale', p_locale, 'avatar_ref', v_avatar);
  v_hash := private.payload_hash('update_profile', v_payload);
  v_result := private.replay(v_actor, p_request_id, v_hash);
  if v_result is not null then return private.ok(v_result); end if;

  begin
    insert into public.profiles (user_id, display_name, locale, avatar_ref)
    values (v_actor, v_name, p_locale, v_avatar)
    on conflict (user_id) do update
      set display_name = excluded.display_name,
          locale = excluded.locale,
          avatar_ref = excluded.avatar_ref,
          updated_at = now()
    returning * into v_profile;

    v_result := jsonb_build_object(
      'user_id', v_profile.user_id, 'display_name', v_profile.display_name,
      'avatar_ref', v_profile.avatar_ref, 'locale', v_profile.locale,
      'created_at', v_profile.created_at, 'updated_at', v_profile.updated_at);
    perform private.record_receipt(
      v_actor, null, p_request_id, 'update_profile', v_hash, v_result);
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'command_receipts_actor_request_unique' then raise; end if;
    v_result := private.replay(v_actor, p_request_id, v_hash);
    if v_result is null then perform private.fail('CONFLICT'); end if;
  end;

  return private.ok(v_result);
end;
$$;
