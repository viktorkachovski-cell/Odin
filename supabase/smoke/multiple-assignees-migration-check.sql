-- Read-only checks around 20261104190000_multiple_task_assignees.sql.
--
-- Run it twice against the SAME database, in a psql session that sets
-- -v phase=before ahead of the migration and -v phase=after behind it:
--
--   psql "$ODIN_DATABASE_URL" -v ON_ERROR_STOP=1 -v phase=before -f supabase/smoke/multiple-assignees-migration-check.sql
--   ... apply the migration ...
--   psql "$ODIN_DATABASE_URL" -v ON_ERROR_STOP=1 -v phase=after  -f supabase/smoke/multiple-assignees-migration-check.sql
--
-- It writes nothing and reads no household text. The two printed fingerprints
-- must be identical: the migration may not change any task row, version or
-- timestamp. The `after` phase additionally proves every assignment became
-- exactly one assignment row and that the legacy projection agrees with it.
select
  count(*) as tasks,
  count(*) filter (where assignee_id is not null) as assigned_tasks,
  md5(string_agg(
    concat_ws('|', id, list_id, sort_order, completed, blocked, assignee_id, due_at, version, updated_at),
    ',' order by id
  )) as fingerprint
from public.tasks;

\if :{?phase}
\else
  \echo 'pass -v phase=before or -v phase=after'
  \quit 1
\endif

select :'phase' = 'after' as check_assignments \gset
\if :check_assignments
  do $$
  declare
    v_assigned bigint;
    v_rows bigint;
    v_missing bigint;
    v_extra bigint;
    v_drift bigint;
  begin
    select count(*) into v_assigned from public.tasks where assignee_id is not null;
    select count(*) into v_rows from public.task_assignees;
    select count(*) into v_missing from public.tasks t
      where t.assignee_id is not null
        and not exists (select 1 from public.task_assignees a
          where a.task_id = t.id and a.user_id = t.assignee_id);
    select count(*) into v_extra from public.task_assignees a
      where not exists (select 1 from public.tasks t where t.id = a.task_id);
    select count(*) into v_drift from public.tasks t
      where t.assignee_id is distinct from
        (select a.user_id from public.task_assignees a where a.task_id = t.id order by a.user_id limit 1);
    if v_rows <> v_assigned or v_missing <> 0 or v_extra <> 0 or v_drift <> 0 then
      raise exception 'assignment backfill mismatch: tasks %, rows %, missing %, orphans %, drift %',
        v_assigned, v_rows, v_missing, v_extra, v_drift;
    end if;
    raise notice 'ok: % assignments migrated, none missing, none extra, projection agrees', v_rows;
  end;
  $$;
\endif
