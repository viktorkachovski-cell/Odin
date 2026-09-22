# Feature behaviour

What the application actually does, as one reference. The API shape behind it
is `contract.md`; the product rules that constrain it are `decisions.md`.

Both clients call the same `@odin/data` commands and read the same
`@odin/i18n` strings, so everything here is shared behaviour unless a section
says otherwise. Android presentation differences are in `android.md`.

## Shared surface

Email/password authentication, onboarding, household invitations, list
create/edit/delete, task create/edit/delete, assignment and unassignment,
claiming, completion and reopening, optional task deadlines, shared task and
list notes, list templates, task templates, profile editing, English/Bulgarian
selection and sign-out.

Email confirmation and password recovery deliberately finish in the web client
on both platforms. Android opens the allowlisted production pages and the
member returns to the app to sign in, which keeps bearer-token handling out of
a second native implementation.

## Lists

A list has a title (1–160 code points), an optional subtitle (up to 300) and an
optional shared note (up to 5,000). Lists never carry a deadline — not in the
UI, not in the DTOs, not in the schema.

The note is one shared field, editable by any active household member. There is
no author and no timestamp; it is not a discussion thread. Both clients render
it under the subtitle and put its editor field under the subtitle field.

## Tasks

A task has a title (1–500 code points), an optional shared note (up to 5,000),
at most one assignee, an optional deadline and an explicit completion state.

- A date with no time resolves on the client to `23:59:59.999` in the device's
  local time zone and is stored as UTC. A time without a date is invalid.
- Completion is an explicit desired state, never a toggle, so a retry cannot
  invert it.
- Tasks render incomplete-first, preserving declared order inside each group.
  Progress counts the whole list, never only the loaded page.
- My Tasks and Unassigned exclude completed and template tasks. Both sort by
  due timestamp ascending, nulls last, with a stable list/task ID tie-breaker.
- A completed task never shows as overdue.

## Templates

Templates are **two separate types that never mix**.

| Type              | Stored as                            | Contains                                                     | Loaded from               |
| ----------------- | ------------------------------------ | ------------------------------------------------------------ | ------------------------- |
| **List template** | `lists` row with `kind = 'template'` | Title, subtitle, notes and a copy of every task in the list  | Home, via `copy_template` |
| **Task template** | `task_templates` row                 | One task title and its notes; no assignment, deadline, state | The task editor           |

- Saving a list as a template creates **one** list template. It never writes a
  task template, so loading a task template stays a task-sized action that
  cannot replace the open list.
- Saving a task as a template creates **one** task template. It never touches a
  list.
- Home's Templates section shows list templates only, and its heading says
  "List templates". The task editor's actions say "task template".

### Saving a list as a template

`save_list_template(request_id, list_id)` snapshots an active, open list:

- The new template copies `title`, `subtitle` and `notes`, and gets
  `kind = 'template'`, `status = 'open'`, `seed_key = null` and
  `created_by = <actor>`.
- Every task copies with its `title`, `notes` and `sort_order`. Completion,
  assignee and deadline are **not** copied; the
  `validate_task_parent_and_assignee` trigger enforces that independently.
- The source list is unmodified, so the command takes no `expected_version`.
- Templates and archived lists cannot be saved as templates; both return the
  non-disclosing `NOT_FOUND`.

`copy_template` is the inverse: it copies the template's title, subtitle, notes
and tasks onto a new active list, resetting task runtime fields.

### Seed content

`private.seed_lists`/`private.seed_tasks` are empty and stay empty. A new
household starts with no templates and builds its own by saving a list it
actually uses — settled by the owner on 2026-09-22, not a pending approval. The
seed tables remain in the schema only so the decision is reversible.

Because member-saved templates have no seed content behind them, the old
`lists_template_seed_key` constraint — which required every template to carry a
`seed_key` — was dropped. `unique (household_id, seed_key)` is unaffected;
Postgres does not treat null as a duplicate.

## Deletion and archiving

- **Lists and templates.** "Delete list" archives an open list of **either
  kind** by setting `status = 'archived'`. Its tasks stay for operator
  recovery. An archived list cannot be deleted again. An archived template
  leaves Home and stops being copyable with no further change, because
  `get_home` and `copy_template` both require `status = 'open'`.

  Templates became deletable on 2026-09-22. While the only templates were
  seeded ones they were deliberately undeletable; once a member could save any
  list as a template, a household that could not delete one would accumulate
  them with no way out. Archiving rather than dropping the row keeps a mis-click
  recoverable and keeps one rule for both kinds.

  Nothing in either client lists, restores or purges an archived row — that is
  risk R2 in `known-risks.md`.

- **Tasks.** "Delete" permanently removes a task from an active, open list. It
  requires the current task version, so a stale screen gets a conflict instead
  of deleting a newer edit.

- **Assignment.** "Unassign" is an `update_task` that preserves title and
  deadline while sending `assignee_id: null`, under the same expected-version
  and membership checks as any task edit.

All of these are actor-scoped, idempotent by `request_id`, and available to any
active household member. Both clients confirm destructive actions and
invalidate Home, list detail, My Tasks and Unassigned after success.

## Client compatibility

Installed Android builds keep calling the original `create_list`, `update_list`,
`create_task` and `update_task`, which are unchanged and preserve an existing
note. Updated clients call the additive `*_v2` variants that accept notes. No
RPC signature, DTO field or error code was ever changed to add a field.

`ListDto`, `ListSummaryDto` and `TaskDto` parse a missing `notes` as `null`, so
the deployment order between database and clients is not load-bearing.

This pattern has no deprecation plan — risk R5 in `known-risks.md`.
