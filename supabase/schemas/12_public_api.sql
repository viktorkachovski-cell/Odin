-- Public command wrappers. SECURITY INVOKER; the privileged work happens in the
-- private helpers, each of which authenticates and authorizes independently.
-- OD001 is the Odin error signal: the transaction has already rolled back, and the
-- handler converts the raised detail into the contract's error envelope.
--
-- Wire parameter names keep the `p_` prefix to avoid PL/pgSQL column ambiguity.
-- Response DTO field names are exactly as specified in docs/02-CONTRACT.md.

create or replace function public.create_household(
  p_request_id uuid, p_name text, p_seed_locale text
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_detail text;
begin
  return private.cmd_create_household(p_request_id, p_name, p_seed_locale);
exception when sqlstate 'OD001' then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail::jsonb;
end;
$$;

create or replace function public.update_profile(
  p_request_id uuid, p_display_name text, p_locale text, p_avatar_ref text default null
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_detail text;
begin
  return private.cmd_update_profile(p_request_id, p_display_name, p_locale, p_avatar_ref);
exception when sqlstate 'OD001' then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail::jsonb;
end;
$$;

create or replace function public.create_list(
  p_request_id uuid, p_title text, p_subtitle text default null
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_detail text;
begin
  return private.cmd_create_list(p_request_id, p_title, p_subtitle);
exception when sqlstate 'OD001' then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail::jsonb;
end;
$$;

create or replace function public.update_list(
  p_request_id uuid, p_list_id uuid, p_expected_version bigint,
  p_title text, p_subtitle text default null
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_detail text;
begin
  return private.cmd_update_list(p_request_id, p_list_id, p_expected_version, p_title, p_subtitle);
exception when sqlstate 'OD001' then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail::jsonb;
end;
$$;

create or replace function public.copy_template(
  p_request_id uuid, p_template_id uuid
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_detail text;
begin
  return private.cmd_copy_template(p_request_id, p_template_id);
exception when sqlstate 'OD001' then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail::jsonb;
end;
$$;

create or replace function public.create_task(
  p_request_id uuid, p_list_id uuid, p_title text,
  p_assignee_id uuid default null, p_due_at timestamptz default null
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_detail text;
begin
  return private.cmd_create_task(p_request_id, p_list_id, p_title, p_assignee_id, p_due_at);
exception when sqlstate 'OD001' then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail::jsonb;
end;
$$;

create or replace function public.update_task(
  p_request_id uuid, p_task_id uuid, p_expected_version bigint, p_title text,
  p_assignee_id uuid default null, p_due_at timestamptz default null
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_detail text;
begin
  return private.cmd_update_task(
    p_request_id, p_task_id, p_expected_version, p_title, p_assignee_id, p_due_at);
exception when sqlstate 'OD001' then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail::jsonb;
end;
$$;

create or replace function public.set_task_completed(
  p_request_id uuid, p_task_id uuid, p_expected_version bigint, p_completed boolean
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_detail text;
begin
  return private.cmd_set_task_completed(p_request_id, p_task_id, p_expected_version, p_completed);
exception when sqlstate 'OD001' then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail::jsonb;
end;
$$;

create or replace function public.claim_task(
  p_request_id uuid, p_task_id uuid, p_expected_version bigint
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_detail text;
begin
  return private.cmd_claim_task(p_request_id, p_task_id, p_expected_version);
exception when sqlstate 'OD001' then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail::jsonb;
end;
$$;

create or replace function public.create_invitation(p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_detail text;
begin
  return private.cmd_create_invitation(p_request_id);
exception when sqlstate 'OD001' then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail::jsonb;
end;
$$;

create or replace function public.redeem_invitation(p_request_id uuid, p_token text)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_detail text;
begin
  return private.cmd_redeem_invitation(p_request_id, p_token);
exception when sqlstate 'OD001' then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail::jsonb;
end;
$$;

create or replace function public.revoke_invitation(p_request_id uuid, p_invitation_id uuid)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_detail text;
begin
  return private.cmd_revoke_invitation(p_request_id, p_invitation_id);
exception when sqlstate 'OD001' then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail::jsonb;
end;
$$;
