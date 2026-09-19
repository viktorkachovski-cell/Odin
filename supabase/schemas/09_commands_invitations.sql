-- Invitation commands. Raw tokens are never stored: the token is rederived from a
-- per-invitation nonce and the server secret, so an idempotent retry returns the
-- same usable link while `token_hash` stays the only lookup key.

create table if not exists private.settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into private.settings (key, value) values
  ('invitation_ttl_hours', '72'::jsonb),
  ('invite_create_limit', '10'::jsonb),
  ('invite_create_window_minutes', '60'::jsonb),
  ('invite_redeem_fail_limit', '10'::jsonb),
  ('invite_redeem_fail_window_minutes', '15'::jsonb)
on conflict (key) do nothing;

create or replace function private.setting_int(p_key text, p_default integer)
returns integer language sql stable security definer set search_path = ''
as $$
  select coalesce((select (s.value #>> '{}')::integer from private.settings s where s.key = p_key), p_default);
$$;

create or replace function private.derive_token(p_nonce bytea)
returns text language sql stable security definer set search_path = ''
as $$
  -- URL-safe, unpadded; 256 bits of HMAC output over a 256-bit random nonce.
  select translate(
    replace(encode(extensions.hmac(p_nonce,
      (select s.value from private.server_secrets s where s.key = 'invitation_token'),
      'sha256'), 'base64'), E'\n', ''),
    '+/=', '-_');
$$;

create or replace function private.token_hash(p_token text)
returns text language sql immutable set search_path = ''
as $$ select encode(extensions.digest(p_token, 'sha256'), 'hex') $$;

create or replace function private.invitation_response(p_invitation_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_row private.invitations;
begin
  select * into v_row from private.invitations i where i.id = p_invitation_id;
  if not found then perform private.fail('NOT_FOUND'); end if;
  return jsonb_build_object(
    'invitation_id', v_row.id,
    'expires_at', v_row.expires_at,
    'token', private.derive_token(v_row.nonce));
end;
$$;

-- Records the attempt and reports whether it was within the limit. Unlike
-- check_rate this never raises, so the counter survives a failed redemption
-- that returns an error instead of aborting the transaction.
create or replace function private.consume_rate(
  p_actor uuid, p_kind text, p_limit integer, p_window interval
) returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_count integer;
begin
  select count(*) into v_count from private.rate_events e
  where e.actor_id = p_actor and e.kind = p_kind and e.created_at > now() - p_window;
  insert into private.rate_events (actor_id, kind) values (p_actor, p_kind);
  return v_count < p_limit;
end;
$$;

create or replace function private.cmd_create_invitation(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_hash text; v_result jsonb; v_household uuid;
  v_nonce bytea; v_token text; v_invitation uuid; v_expires timestamptz;
  v_constraint text;
begin
  v_hash := private.payload_hash('create_invitation', '{}'::jsonb);
  v_result := private.replay(v_actor, p_request_id, v_hash);
  if v_result is not null then
    -- The receipt holds no raw token; rederive the same link.
    return private.ok(private.invitation_response((v_result ->> 'invitation_id')::uuid));
  end if;

  v_household := private.require_active_household(v_actor);
  perform private.check_rate(
    v_actor, 'invite_create',
    private.setting_int('invite_create_limit', 10),
    make_interval(mins => private.setting_int('invite_create_window_minutes', 60)));

  v_expires := now() + make_interval(hours => private.setting_int('invitation_ttl_hours', 72));

  begin
    v_nonce := extensions.gen_random_bytes(32);
    v_token := private.derive_token(v_nonce);
    insert into private.invitations (household_id, created_by, nonce, token_hash, expires_at)
    values (v_household, v_actor, v_nonce, private.token_hash(v_token), v_expires)
    returning id into v_invitation;

    perform private.record_receipt(
      v_actor, v_household, p_request_id, 'create_invitation', v_hash,
      jsonb_build_object('invitation_id', v_invitation, 'expires_at', v_expires));
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'command_receipts_actor_request_unique' then raise; end if;
    v_result := private.replay(v_actor, p_request_id, v_hash);
    if v_result is null then perform private.fail('CONFLICT'); end if;
    return private.ok(private.invitation_response((v_result ->> 'invitation_id')::uuid));
  end;

  return private.ok(jsonb_build_object(
    'invitation_id', v_invitation, 'expires_at', v_expires, 'token', v_token));
end;
$$;

-- Redemption failures return an error rather than raising, so the failed-attempt
-- rate counter commits. Nothing is written before the checks, so there is no
-- partial state to roll back.
create or replace function private.cmd_redeem_invitation(p_request_id uuid, p_token text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_payload jsonb; v_hash text; v_result jsonb;
  v_invitation private.invitations; v_constraint text;
begin
  if private.norm_text(p_token) is null then
    perform private.fail('VALIDATION', 'validation.token.required');
  end if;
  -- The token itself is never hashed into the receipt payload in raw form.
  v_payload := jsonb_build_object('token_hash', private.token_hash(p_token));
  v_hash := private.payload_hash('redeem_invitation', v_payload);
  v_result := private.replay(v_actor, p_request_id, v_hash);
  if v_result is not null then return private.ok(v_result); end if;

  if not private.consume_rate(
       v_actor, 'invite_redeem_fail',
       private.setting_int('invite_redeem_fail_limit', 10),
       make_interval(mins => private.setting_int('invite_redeem_fail_window_minutes', 15)))
  then
    return private.err('RATE_LIMITED');
  end if;

  -- Membership serialization key first, then the invitation row (contract lock order).
  perform private.lock_user(v_actor);

  select * into v_invitation from private.invitations i
  where i.token_hash = private.token_hash(p_token)
  for update;
  if not found then return private.err('NOT_FOUND'); end if;
  if v_invitation.revoked_at is not null then return private.err('INVITE_REVOKED'); end if;
  if v_invitation.redeemed_at is not null then return private.err('INVITE_USED'); end if;
  if v_invitation.expires_at <= now() then return private.err('INVITE_EXPIRED'); end if;

  if exists (
    select 1 from public.memberships m where m.user_id = v_actor and m.status = 'active'
  ) then
    return private.err('ALREADY_IN_HOUSEHOLD');
  end if;

  begin
    update private.invitations i
    set redeemed_by = v_actor, redeemed_at = now()
    where i.id = v_invitation.id;

    insert into public.memberships (household_id, user_id, status)
    values (v_invitation.household_id, v_actor, 'active')
    on conflict (household_id, user_id) do update
      set status = 'active', updated_at = now();

    v_result := jsonb_build_object('household_id', v_invitation.household_id);
    perform private.record_receipt(
      v_actor, v_invitation.household_id, p_request_id, 'redeem_invitation', v_hash, v_result);
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'command_receipts_actor_request_unique' then
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

create or replace function private.cmd_revoke_invitation(p_request_id uuid, p_invitation_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_payload jsonb; v_hash text; v_result jsonb;
  v_household uuid; v_invitation private.invitations; v_constraint text;
begin
  v_payload := jsonb_build_object('invitation_id', p_invitation_id);
  v_hash := private.payload_hash('revoke_invitation', v_payload);
  v_result := private.replay(v_actor, p_request_id, v_hash);
  if v_result is not null then return private.ok(v_result); end if;

  v_household := private.require_active_household(v_actor);
  select * into v_invitation from private.invitations i
  where i.id = p_invitation_id and i.household_id = v_household
  for update;
  if not found then perform private.fail('NOT_FOUND'); end if;
  -- Creator-only under the proposed default in docs/01-DECISIONS.md.
  if v_invitation.created_by <> v_actor then perform private.fail('FORBIDDEN'); end if;

  begin
    -- Idempotent: revoking an already-revoked invitation succeeds.
    update private.invitations i
    set revoked_at = coalesce(i.revoked_at, now())
    where i.id = p_invitation_id;
    v_result := jsonb_build_object('invitation_id', p_invitation_id);
    perform private.record_receipt(
      v_actor, v_household, p_request_id, 'revoke_invitation', v_hash, v_result);
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'command_receipts_actor_request_unique' then raise; end if;
    v_result := private.replay(v_actor, p_request_id, v_hash);
    if v_result is null then perform private.fail('CONFLICT'); end if;
  end;
  return private.ok(v_result);
end;
$$;
