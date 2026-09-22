revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke all on all sequences in schema private from public, anon, authenticated;

grant usage on schema public to authenticated;
grant execute on function public.delete_list(uuid, uuid, bigint) to authenticated;
grant execute on function public.delete_task(uuid, uuid, bigint) to authenticated;
grant execute on function private.delete_list(uuid, uuid, bigint) to authenticated;
grant execute on function private.delete_task(uuid, uuid, bigint) to authenticated;
grant execute on function private.create_task_v2(uuid, uuid, text, uuid, timestamptz, text) to authenticated;
grant execute on function private.update_task_v2(uuid, uuid, bigint, text, uuid, timestamptz, text) to authenticated;
grant execute on function private.save_task_template(uuid, text, text) to authenticated;
grant execute on function private.get_task_templates() to authenticated;
grant usage on schema private to authenticated;
grant select on public.profiles, public.households, public.memberships, public.lists, public.tasks
to authenticated;

grant execute on function private.is_active_member(uuid, uuid) to authenticated;
grant execute on function private.active_household_id(uuid) to authenticated;
grant execute on function private.lock_active_members(uuid, uuid[]) to authenticated;
grant execute on function private.lock_command(uuid, uuid) to authenticated;
grant execute on function private.error_response(text, text, bigint) to authenticated;
grant execute on function private.ok_response(jsonb) to authenticated;
grant execute on function private.encode_cursor(jsonb) to authenticated;
grant execute on function private.decode_cursor(text) to authenticated;
grant execute on function private.update_profile(uuid, text, text, text) to authenticated;
grant execute on function private.create_household(uuid, text, text) to authenticated;
grant execute on function private.create_list(uuid, text, text) to authenticated;
grant execute on function private.update_list(uuid, uuid, bigint, text, text) to authenticated;
grant execute on function private.create_list_v2(uuid, text, text, text) to authenticated;
grant execute on function private.update_list_v2(uuid, uuid, bigint, text, text, text) to authenticated;
grant execute on function private.save_list_template(uuid, uuid) to authenticated;
grant execute on function private.copy_template(uuid, uuid) to authenticated;
grant execute on function private.create_task(uuid, uuid, text, uuid, timestamptz) to authenticated;
grant execute on function private.update_task(uuid, uuid, bigint, text, uuid, timestamptz) to authenticated;
grant execute on function private.set_task_completed(uuid, uuid, bigint, boolean) to authenticated;
grant execute on function private.claim_task(uuid, uuid, bigint) to authenticated;
grant execute on function private.create_invitation(uuid) to authenticated;
grant execute on function private.redeem_invitation(uuid, text) to authenticated;
grant execute on function private.revoke_invitation(uuid, uuid) to authenticated;
grant execute on function private.get_cross_list_tasks(text, text, integer) to authenticated;
grant execute on function private.get_members() to authenticated;

grant execute on function public.update_profile(uuid, text, text, text) to authenticated;
grant execute on function public.create_household(uuid, text, text) to authenticated;
grant execute on function public.create_list(uuid, text, text) to authenticated;
grant execute on function public.update_list(uuid, uuid, bigint, text, text) to authenticated;
grant execute on function public.create_list_v2(uuid, text, text, text) to authenticated;
grant execute on function public.update_list_v2(uuid, uuid, bigint, text, text, text) to authenticated;
grant execute on function public.save_list_template(uuid, uuid) to authenticated;
grant execute on function public.copy_template(uuid, uuid) to authenticated;
grant execute on function public.create_task(uuid, uuid, text, uuid, timestamptz) to authenticated;
grant execute on function public.update_task(uuid, uuid, bigint, text, uuid, timestamptz) to authenticated;
grant execute on function public.create_task_v2(uuid, uuid, text, uuid, timestamptz, text) to authenticated;
grant execute on function public.update_task_v2(uuid, uuid, bigint, text, uuid, timestamptz, text) to authenticated;
grant execute on function public.save_task_template(uuid, text, text) to authenticated;
grant execute on function public.set_task_completed(uuid, uuid, bigint, boolean) to authenticated;
grant execute on function public.claim_task(uuid, uuid, bigint) to authenticated;
grant execute on function public.create_invitation(uuid) to authenticated;
grant execute on function public.redeem_invitation(uuid, text) to authenticated;
grant execute on function public.revoke_invitation(uuid, uuid) to authenticated;
grant execute on function public.get_my_household() to authenticated;
grant execute on function public.get_members() to authenticated;
grant execute on function public.get_task_templates() to authenticated;
grant execute on function public.get_home(text, integer) to authenticated;
grant execute on function public.get_list(uuid, text, integer) to authenticated;
grant execute on function public.get_unassigned(text, integer) to authenticated;
grant execute on function public.get_my_tasks(text, integer) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lists'
    ) then
      alter publication supabase_realtime add table public.lists;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
    ) then
      alter publication supabase_realtime add table public.tasks;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'memberships'
    ) then
      alter publication supabase_realtime add table public.memberships;
    end if;
  end if;
end;
$$;
