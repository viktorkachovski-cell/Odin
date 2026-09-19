-- Least-privilege execution. EXECUTE defaults to PUBLIC in PostgreSQL, so every
-- function is revoked first and then granted deliberately.

revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;

-- Commands: the public wrapper plus the private helper it resolves as the caller.
grant execute on function
  public.create_household(uuid, text, text),
  public.update_profile(uuid, text, text, text),
  public.create_list(uuid, text, text),
  public.update_list(uuid, uuid, bigint, text, text),
  public.copy_template(uuid, uuid),
  public.create_task(uuid, uuid, text, uuid, timestamptz),
  public.update_task(uuid, uuid, bigint, text, uuid, timestamptz),
  public.set_task_completed(uuid, uuid, bigint, boolean),
  public.claim_task(uuid, uuid, bigint),
  public.create_invitation(uuid),
  public.redeem_invitation(uuid, text),
  public.revoke_invitation(uuid, uuid)
to authenticated;

grant execute on function
  private.cmd_create_household(uuid, text, text),
  private.cmd_update_profile(uuid, text, text, text),
  private.cmd_create_list(uuid, text, text),
  private.cmd_update_list(uuid, uuid, bigint, text, text),
  private.cmd_copy_template(uuid, uuid),
  private.cmd_create_task(uuid, uuid, text, uuid, timestamptz),
  private.cmd_update_task(uuid, uuid, bigint, text, uuid, timestamptz),
  private.cmd_set_task_completed(uuid, uuid, bigint, boolean),
  private.cmd_claim_task(uuid, uuid, bigint),
  private.cmd_create_invitation(uuid),
  private.cmd_redeem_invitation(uuid, text),
  private.cmd_revoke_invitation(uuid, uuid)
to authenticated;

-- Reads.
grant execute on function
  public.get_home(),
  public.get_list(uuid, text, integer),
  public.get_my_tasks(text, integer),
  public.get_unassigned(text, integer),
  public.get_members(),
  public.get_my_household()
to authenticated;

-- Helpers reached from SECURITY INVOKER reads and from RLS policies. Each one is
-- side-effect free and either pinned to auth.uid() or a pure formatter.
grant execute on function
  private.is_active_member(uuid),
  private.active_household_id(),
  private.require_actor(),
  private.fail(text, text, bigint),
  private.err(text, text, bigint),
  private.ok(jsonb),
  private.norm_text(text),
  private.trimmed_len(text),
  private.page_size(integer),
  private.encode_cursor(jsonb),
  private.decode_cursor(text),
  private.list_dto(public.lists),
  private.task_dto(public.tasks),
  private.cross_list_tasks(text, text, integer)
to authenticated;

-- Realtime carries invalidation hints only; RLS still governs what each subscriber
-- may see. Adding an already-published table is not an error worth failing on.
do $$
begin
  begin
    alter publication supabase_realtime add table public.lists;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.tasks;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.memberships;
  exception when duplicate_object then null;
  end;
end;
$$;
