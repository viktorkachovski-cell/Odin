-- Templates become deletable (docs/18-LIST-TASK-LIFECYCLE.md,
-- docs/23-LIST-TEMPLATES-AND-LIST-NOTES.md).
--
-- delete_list previously required kind = 'active', which was right while the
-- only templates were the ones create_household seeds. Now that a member can
-- save any list as a template, a household that could not delete one would
-- accumulate templates with no way out. The command still archives rather than
-- drops, so the tasks inside stay recoverable, and every other guarantee --
-- expected_version, actor scoping, request_id idempotency and the
-- non-disclosing NOT_FOUND -- is unchanged.

CREATE OR REPLACE FUNCTION private.delete_list (
  p_request_id       uuid,
  p_list_id          uuid,
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
  v_list public.lists%rowtype;
  v_hash bytea;
  v_replay jsonb;
  v_response jsonb;
begin
  if v_actor is null then return private.error_response('UNAUTHENTICATED', 'error.unauthenticated'); end if;
  if p_request_id is null or p_list_id is null or p_expected_version is null or p_expected_version < 1 then
    return private.error_response('VALIDATION', 'error.command_invalid');
  end if;
  v_household := private.active_household_id(v_actor);
  if v_household is null then return private.error_response('FORBIDDEN', 'error.household_required'); end if;
  perform private.lock_command(v_actor, p_request_id);
  if not private.lock_active_members(v_household, array[v_actor]) then
    return private.error_response('FORBIDDEN', 'error.household_required');
  end if;
  v_hash := private.command_hash(jsonb_build_object(
    'list_id', p_list_id, 'expected_version', p_expected_version
  ));
  v_replay := private.replay_command(v_actor, p_request_id, 'delete_list', v_hash);
  if v_replay is not null then return v_replay; end if;

  -- Either kind: a member who can save a list as a template can also remove
  -- one. Archiving keeps the tasks recoverable, and both get_home and
  -- copy_template already require status = 'open', so an archived template
  -- leaves Home and stops being copyable with no further change.
  select * into v_list from public.lists
  where id = p_list_id and household_id = v_household and status = 'open'
  for update;
  if not found then return private.error_response('NOT_FOUND', 'error.not_found'); end if;
  if v_list.version <> p_expected_version then
    return private.error_response('CONFLICT', 'error.conflict', v_list.version);
  end if;

  update public.lists set status = 'archived' where id = p_list_id;
  v_response := private.ok_response(jsonb_build_object('list_id', p_list_id));
  perform private.save_command(v_actor, p_request_id, v_household, 'delete_list', v_hash, v_response);
  return v_response;
end;
$function$;
