# List and task lifecycle

The owner decision on 2026-09-21 adds removal controls to both clients.

- **Lists:** “Delete list” archives an active list by setting its existing
  `status` to `archived`. Its tasks remain available to an operator for
  recovery and are excluded from active-list reads. Templates and already
  archived lists cannot be deleted through the public command.
- **Tasks:** “Delete” permanently removes a task from an active/open list.
  The command requires the current task version, so a stale screen receives a
  conflict instead of deleting a newer edit.
- **Assignment:** “Unassign” is an `update_task` request that preserves the
  title and deadline while sending `assignee_id: null`. It uses the same
  expected-version and household-membership checks as any task edit.

All three actions are actor-scoped, idempotent by `request_id`, and available
to any active household member. The UI confirms destructive actions and
invalidates Home, list detail, My Tasks, and Unassigned queries after success.

The migration is `supabase/migrations/20260921180000_delete_list_task_commands.sql`.
