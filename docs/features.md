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
at most one assignee, an optional deadline and an explicit state.

- A date with no time resolves on the client to `23:59:59.999` in the device's
  local time zone and is stored as UTC. A time without a date is invalid.
- Completion is an explicit desired state, never a toggle, so a retry cannot
  invert it. A completed task never shows as overdue.
- Four visible statuses: Unassigned, To-do, Blocked and Done. A task is stored
  as Open, Blocked or Done; an open task shows Unassigned without an assignee
  and To-do with one, so that label follows assignment automatically. Blocked
  and Done are explicit choices and do not change the assignee. Assignment
  changes preserve a blocked state; completion and reopening clear it.
- Up/down moves persist one shared household order: tasks within their
  incomplete/completed group (a template's tasks too), active lists and list
  templates each within their own kind. End-of-group moves are disabled, and
  every move control stays disabled until the previous move's result has
  reloaded, so rapid taps never send a stale version.
- Progress counts the whole list. Lists, list detail and the household task
  read each load in one read, so a reorder by another member can never drop or
  repeat a row; a collection above 1,000 rows shows a "too many items" message
  instead of a partial list (R10).

## Navigation and task views

Both clients have four destinations: **Today**, **Tasks**, **Lists** and
**Settings** (owner amendment of 2026-10-11 in `decisions.md`). The old
`/my-tasks`, `/unassigned` and `/all-tasks` routes redirect to Tasks with the
matching view, so links, bookmarks and notification taps still land.

- **One household read.** Today, Tasks and the Tasks badge all derive from the
  unfiltered `get_all_tasks` read, filtered on the client by the shared
  `@odin/domain` functions `filterTasks`, `groupTasksByDeadline`,
  `groupMyTasksForToday` and `summarizeTasks`. The deadline presets apply the
  bounds `resolveTaskDeadlineFilter` gives the server, so a filter moved
  client-side returns the same tasks. Mine and Unassigned show open tasks
  only, the member's own or nobody's, due-ascending with undated last.
- **Today** shows four counts that open the matching Tasks filter (Overdue and
  Due today across the household, Unassigned, Blocked), the member's open tasks
  grouped Overdue / Today / Upcoming with undated ones summarised by a link, up
  to three unclaimed tasks with Claim, and active-list progress.
- **Tasks** has Mine / Unassigned / Everyone with counts, deadline chips (All,
  Overdue, Today, Upcoming, No deadline, Date range), a Blocked-only chip,
  search over title, notes and list name, and Show done (Everyone only).
  Overdue excludes done tasks and means deadline before now; Today is the whole
  local day; Upcoming starts tomorrow; a range includes both local dates, and
  an invalid or reversed range cannot be applied. Rows are grouped Overdue,
  Today, Upcoming, No deadline, Done. On web the filters live in the URL.
  On Android, approved 2026-10-13, the deadline choices, Blocked only and
  Everyone's Show done live in a Filters sheet. Apply commits the whole draft;
  Cancel or Android Back discards it. Reset changes the sheet draft, and Clear
  filters clears applied deadline/Blocked/Show done while retaining ownership
  and search. The visible result count reflects the current search and filters.
- **Lists** has Active and Templates tabs. A template is used from its row or,
  on web, from the New list menu. Save as template sits in the list's menu and
  a short toast confirms it.
- **Reordering is a mode.** Up/down controls appear only after choosing
  Reorder, on Lists and on list detail.
- **Task rows show exceptions, not defaults.** A status label appears only for
  Blocked; Mark blocked / Unblock, Unassign and Delete sit in the row menu
  (`taskRowActions`). Completion stays a checkbox, separate from opening the
  task. An empty deadline is an empty cell and an unclaimed task offers Claim
  (assistive technology still hears "Unassigned"). Overdue is spelled out.
- **Opening a task opens its editor** (a side panel on web, the editor sheet on
  Android). The draft is pinned to the version it was opened at, so a refetch
  while editing cannot move the save onto a newer version; a conflict keeps the
  draft and offers a review. Delete is available from the editor, behind the
  same confirmation. Template tasks open read-only.
- **New task** on Today and Tasks opens the task editor with a list picker. The
  task still belongs to exactly one active list.
  On Android the title and parent list lead. Assignment, deadline, notes and
  task-template actions sit in an expandable section, initially collapsed for
  new tasks and expanded for existing tasks. Collapsing never clears fields;
  validation expands hidden errors. A failed save or conflict retains the draft.
- **List detail** has a quick add (title only; details from the editor), keeps
  completed tasks collapsed behind a count, and puts Edit, Save as template,
  Reorder (Android) and Delete in one menu. An empty list reads "No tasks yet".

Android's four tabs remain visible while scrolling, following approval of the
mobile review on 2026-10-13. Today distinguishes household counts from My tasks,
offers a profile shortcut, and shows individual task cards with separate list,
deadline and assignment lines. Shared views display assignee names (You for the
current member); Today omits repeated ownership in My tasks. Notes remain in
the editor and searchable. Narrow web navigation keeps its existing behavior.

## Templates

Templates are **two separate types that never mix**.

| Type              | Stored as                            | Contains                                                     | Loaded from                |
| ----------------- | ------------------------------------ | ------------------------------------------------------------ | -------------------------- |
| **List template** | `lists` row with `kind = 'template'` | Title, subtitle, notes and a copy of every task in the list  | Lists, via `copy_template` |
| **Task template** | `task_templates` row                 | One task title and its notes; no assignment, deadline, state | The task editor            |

- Saving a list as a template creates **one** list template. It never writes a
  task template, so loading a task template stays a task-sized action that
  cannot replace the open list.
- Saving a task as a template creates **one** task template. It never touches a
  list.
- The Lists screen's Templates tab shows list templates only. The task
  editor's actions say "task template".

### Saving a list as a template

`save_list_template(request_id, list_id)` snapshots an active, open list:

- The new template copies `title`, `subtitle` and `notes`, and gets
  `kind = 'template'`, `status = 'open'`, `seed_key = null` and
  `created_by = <actor>`.
- Every task copies with its `title`, `notes` and `sort_order`. Completion,
  blocked state, assignee and deadline are **not** copied; the
  `validate_task_parent_and_assignee` trigger enforces that independently.
- The source list is unmodified, so the command takes no `expected_version`.
- Templates and archived lists cannot be saved as templates; both return the
  non-disclosing `NOT_FOUND`.

`copy_template` is the inverse: it copies the template's title, subtitle, notes
and tasks onto a new active list, resetting task runtime fields.

### Seed content

A new household starts with no templates (`decisions.md` item 4); the seed
tables stay empty. Because member-saved templates have no seed content behind them, the old
`lists_template_seed_key` constraint — which required every template to carry a
`seed_key` — was dropped. `unique (household_id, seed_key)` is unaffected;
Postgres does not treat null as a duplicate.

## Notifications

**Android only** (`decisions.md`, notification amendment of 2026-09-22). The
web client has no notification behaviour.

Odin notifies a member about three things:

| Trigger                   | Fires when                                                        |
| ------------------------- | ----------------------------------------------------------------- |
| A task becomes yours      | A task you were not assigned is now assigned to you               |
| A task of yours changed   | A task already assigned to you comes back with a higher `version` |
| A deadline is approaching | 24 hours, then 4 hours, then 1 hour before it                     |

- **Two switches gate everything.** Android's notification permission and a
  per-device mute in Settings must both allow it. Muting is per device, not per
  account, so a spare phone can be silenced without silencing the one you carry.
- **Deadline reminders cover your own tasks and unassigned ones**, so dated
  work nobody has claimed is not missed. The two sets are disjoint, and a task
  you claim keeps the reminders it already had.
- **A stage that has already passed is skipped**, never fired late. A task
  created 30 minutes before its deadline gets no deadline reminder at all,
  because a "due in 4 hours" warning delivered 30 minutes before the deadline
  misinforms. The assignment notification still fires.
- **A change is only announced while the app is not in the foreground.** A
  member looking at Odin watches the row move on its own, and this is what
  stops the app announcing your own claim or edit back at you.
- **Two or more changes in one sync collapse into one summary** rather than a
  stack of notifications.
- **Completing a task silences it** at the next reconciliation, because My
  Tasks and Unassigned both exclude completed tasks. Reconciliation only
  happens while the app runs, so a reminder for a task somebody else finished
  while Odin was closed still fires — risk R9.
- **Signing out or switching account cancels every scheduled reminder**, so a
  task title cannot arrive on a phone after the account that owns it is gone.

Both change triggers compare two readings of `getMyTasks`, using the `version`
the contract already increments once per change. What this cannot do is risk
R9 in `known-risks.md`.

## Deletion and archiving

- **Lists and templates.** "Delete list" archives an open list of **either
  kind** by setting `status = 'archived'`. Its tasks stay for operator
  recovery. An archived list cannot be deleted again. An archived template
  leaves Lists and stops being copyable with no further change, because
  list reads and `copy_template` require `status = 'open'`.

  Templates became deletable on 2026-09-22, once members could save their own.
  Archiving rather than dropping the row keeps a mis-click recoverable and
  keeps one rule for both kinds.

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
invalidate every affected read after success.

## Client compatibility

Installed Android builds retain their original note-preserving create/update
RPCs and the paged household reads. Current clients use `*_v2` note commands
and snapshot reads. Parsers tolerate a missing `notes`, `blocked` or list
`sort_order` in legacy payloads, but current clients need all three
task-workflow migrations.

The legacy API has no deprecation plan — risk R5 in `known-risks.md`. Exact
signatures and migration order are in `contract.md` and `operations.md`.
