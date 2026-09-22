# List templates and list notes

Owner decision on 2026-09-22. Three requirements land together:

1. A list can be saved as a template, and the template keeps every task inside
   that list.
2. List templates and task templates stay separate types, so a member can load
   a task template on its own without pulling in a whole list.
3. Lists gain a shared note, shown under the subtitle.

Production database: Supabase project `mvltbhtsukorspmpyhpw` in eu-central-1.

## 1. Two template types, never mixed

| Type              | Stored as                            | Contains                                                       | Loaded by                                  |
| ----------------- | ------------------------------------ | -------------------------------------------------------------- | ------------------------------------------ |
| **List template** | `lists` row with `kind = 'template'` | Title, subtitle, notes, and a copy of every task in the list   | `copy_template`, from the Home screen      |
| **Task template** | `task_templates` row                 | One task title and its notes; no assignment, deadline or state | `get_task_templates`, from the task editor |

The two are stored, read, saved and presented separately:

- Saving a list as a template creates **one** list template. It never creates a
  task template per task; those tasks live inside the list template.
- Saving a task as a template creates **one** task template. It never creates or
  touches a list.
- The task editor's picker reads `get_task_templates` only, so loading a task
  template stays a task-sized action that never replaces the open list.
- Home's Templates section lists list templates only. Its heading and empty
  state say "list template" so the two types are not confused in the UI.

## 2. Saving a list as a template

`save_list_template(request_id, list_id)` snapshots an active, open list into a
new list template in the same household.

- The new template copies the source `title`, `subtitle` and `notes`, and gets
  `kind = 'template'`, `status = 'open'`, `seed_key = null` and
  `created_by = <actor>`.
- Every task in the source list is copied with its `title`, `notes` and
  `sort_order`. Completion, assignee and deadline are **not** copied: template
  tasks carry no runtime state, which the existing
  `validate_task_parent_and_assignee` trigger already enforces.
- The source list is not modified, so the command takes no `expected_version`.
  It is a snapshot read of the source and an insert of the copy, in one
  transaction.
- The command is actor-scoped and idempotent by `request_id`, like every other
  mutation. A replay returns the original `{list_id}` rather than saving a
  second template.
- Templates and archived lists cannot be saved as templates; both return
  `NOT_FOUND`, the same non-disclosing shape a cross-household ID gets.
- Any active household member may save a list as a template, matching the
  equal-permission rule.

`copy_template` is the inverse and is unchanged except that it now also copies
the template's `notes` onto the new active list.

### Seed-key invariant

`lists_template_seed_key` previously required every template to carry a
`seed_key`, because the only templates were the ones `create_household` copies
out of `private.seed_lists`. Member-saved templates have no seed content behind
them, so that constraint is dropped. `unique (household_id, seed_key)` stays
and still keeps one seeded template per key per household; several member-saved
templates coexist because Postgres does not treat null as a duplicate.

### Deleting a template — owner decision 2026-09-22

A template is deletable. `delete_list` no longer requires `kind = 'active'`; it
archives any open list of either kind. Saving templates without being able to
delete them left a household accumulating them with no way out, so this closes
that gap rather than leaving it to a later pass.

- Archiving, not dropping the row: the tasks inside the template survive for
  operator recovery, and a mis-click is reversible. One rule covers both list
  kinds, so there is nothing extra to explain in the UI.
- A deleted template leaves Home and can no longer be copied without any
  further change, because `get_home` and `copy_template` already require
  `status = 'open'`.
- Everything else about the command is unchanged: same `expected_version`
  check, so a stale screen gets `CONFLICT`; same actor scoping, same
  `request_id` idempotency; same non-disclosing `NOT_FOUND` for another
  household's list or one already archived.
- Seeded templates are deletable on the same terms. `seed.sql` is empty today,
  so no household has one, and a member who wants a seeded template gone should
  not be told no.

Both clients offer it from the same overflow menu that carries **Delete list**
on an active list, behind the same confirmation.

## 3. List notes

- `lists.notes` is one shared, optional field of up to 5,000 Unicode code
  points, normalized by `private.normalized_text` like every other text column.
  It matches the task-notes limit and reuses `LIMITS.notes` and
  `validateNotes`.
- Every active household member with normal list access can edit it. There is
  no author, no timestamp and no thread, exactly as with task notes.
- Both clients render it under the subtitle, and the editor places the note
  field under the subtitle field.
- `copy_template` and `save_list_template` both carry notes across.

## Compatibility

Installed Android clients keep calling `create_list` and `update_list`, which
are unchanged and take no notes. `update_list` therefore does not overwrite an
existing note. Updated clients call the additive `create_list_v2` and
`update_list_v2`, which accept notes. This is the same additive pattern used
for task notes in `docs/21-TASK-FEATURES-DEPLOYMENT.md`; no existing RPC
signature, DTO field or error code changes.

`ListDto` and `ListSummaryDto` gain a nullable `notes` field. A client reading
a response from a database that predates this change parses a missing `notes`
as `null`, so the order of deployment between database and clients is not
load-bearing.

## Production record — 2026-09-22

Applied migration `list_templates_and_notes` (hosted version `20260922060702`),
mirroring `supabase/migrations/20260922120000_list_templates_and_notes.sql`:
`lists.notes` and its constraint, the dropped `lists_template_seed_key`, the
note-aware `create_list_v2`/`update_list_v2`, `save_list_template`, a
note-carrying `copy_template`, a note-projecting `get_home`, and explicit
revokes and grants for the new functions.

The production-safe smoke script in `supabase/smoke/list-templates-smoke.sql`
ran against the hosted project inside a transaction that was forced to roll
back, so no synthetic row survived it. Row counts before and after were
identical. It passed: list-note creation, the 5,000-code-point boundary, legacy
`update_list` preserving an existing note, `update_list_v2` replacing it,
saving a list as a template with both of its tasks, the template carrying the
list note and the task notes, task runtime state being reset, idempotent
replay, a template not being saveable as a template, no task template being
written, `copy_template` carrying the note and tasks back, `get_home`
projecting the note, and cross-household denial.

Privilege verification showed the three new public wrappers are
`SECURITY INVOKER` with `search_path` pinned, their private helpers are
`SECURITY DEFINER`, `anon` can execute none of them, and `authenticated` can
execute exactly the public and private pairs the migration grants.

Security and performance advisors reported no new finding. The two standing
security notices (default-deny RLS on `task_templates`, and Auth's leaked
password protection being off) and the four standing performance notices
predate this change.

Rollback requires a reviewed forward migration: revoke and drop
`create_list_v2`, `update_list_v2` and `save_list_template` with their private
helpers, restore the previous `copy_template` and `get_home` bodies, and drop
`lists.notes` only after confirming no note must be retained. Restoring
`lists_template_seed_key` first requires deleting or re-keying every
member-saved template. Do not run a production reset or destructive rollback
automatically.
