# List and task lifecycle

The owner decision on 2026-09-21 adds removal controls to both clients.

- **Lists:** “Delete list” archives an open list by setting its existing
  `status` to `archived`. Its tasks remain available to an operator for
  recovery and are excluded from active-list reads. An already archived list
  cannot be deleted again.

  Amended 2026-09-22: this covers **templates as well as active lists**. When
  templates were only the ones `create_household` seeds, they were deliberately
  undeletable; now that a member can save any list as a template, a household
  that could not delete one would accumulate them with no way out. A deleted
  template disappears from Home and can no longer be copied, because both
  `get_home` and `copy_template` already require `status = 'open'`. Archiving
  rather than dropping the row keeps a mis-click recoverable and keeps one rule
  for both list kinds. See `docs/23-LIST-TEMPLATES-AND-LIST-NOTES.md`.

- **Tasks:** “Delete” permanently removes a task from an active/open list.
  The command requires the current task version, so a stale screen receives a
  conflict instead of deleting a newer edit.
- **Assignment:** “Unassign” is an `update_task` request that preserves the
  title and deadline while sending `assignee_id: null`. It uses the same
  expected-version and household-membership checks as any task edit.

Archiving has no counterpart in either client: nothing lists, restores or
purges an archived row, so recovery needs an operator with database access.
That is risk R2 in `docs/25-KNOWN-RISKS.md`, and it grows faster now that
templates archive too.

All three actions are actor-scoped, idempotent by `request_id`, and available
to any active household member. The UI confirms destructive actions and
invalidates Home, list detail, My Tasks, and Unassigned queries after success.

The migrations are
`supabase/migrations/20260921180000_delete_list_task_commands.sql` and, for the
template amendment, `supabase/migrations/20260922140000_deletable_list_templates.sql`.
