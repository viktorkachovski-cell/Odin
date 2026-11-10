-- Clears the standing performance advisor findings: four foreign keys without
-- a covering index and a table without a primary key. Additive only: no
-- function, grant, policy or client-visible shape changes.

create index households_created_by_idx on public.households (created_by);

create index lists_created_by_idx on public.lists (created_by);

create index invitations_redeemed_by_idx on private.invitations (redeemed_by);

-- The primary key leads with task_id alone, so a task delete's cascade had no
-- index matching (household_id, task_id).
create index task_assignees_task_idx
on public.task_assignees (household_id, task_id);

-- Rate-limit log rows had no identity. Every insert names actor_user_id only,
-- so the new column fills itself and existing rows are numbered in place.
alter table private.invitation_attempts
  add column id bigint generated always as identity primary key;
