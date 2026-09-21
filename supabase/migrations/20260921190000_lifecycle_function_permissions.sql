-- Match the existing signed-in-only command boundary, including explicit
-- grants inherited from hosted default privileges.
revoke all on function public.delete_list(uuid, uuid, bigint) from public, anon;
revoke all on function public.delete_task(uuid, uuid, bigint) from public, anon;
revoke all on function private.delete_list(uuid, uuid, bigint) from public, anon;
revoke all on function private.delete_task(uuid, uuid, bigint) from public, anon;
grant execute on function public.delete_list(uuid, uuid, bigint) to authenticated;
grant execute on function public.delete_task(uuid, uuid, bigint) to authenticated;
grant execute on function private.delete_list(uuid, uuid, bigint) to authenticated;
grant execute on function private.delete_task(uuid, uuid, bigint) to authenticated;
