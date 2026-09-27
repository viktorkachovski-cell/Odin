# Deployment log

Append-only record of what reached the hosted Supabase project and production
web deployment, newest last. Each entry names the migrations, the verification
that ran and the advisor findings, so a later agent can tell what a given
production state actually contains.

How to deploy is `operations.md`. What the changes do is `features.md`.

Supabase project throughout: Odin `mvltbhtsukorspmpyhpw`, eu-central-1. Local
and hosted migration histories already diverge, so **never push the full local
history**; match applied names and contents before planning a deployment.

## Initial schema rollout

`schemas/00_core.sql` … `04_grants_and_realtime.sql` applied in order as
migrations of the same names. The deployed function set was verified
afterwards: 18 public RPCs with matching argument names and security modes, and
the privileged helpers (`invitation_token`, `invitation_secret`,
`save_command`, `replay_command`, `normalized_text`, `command_hash`) not
executable by `authenticated`. Types were generated into
`packages/contracts/src/database.generated.ts`.

Verification fixtures (three `@example.invalid` accounts and their data) were
created and then deleted. The project has since been in real use and holds live
household data.

## List and task lifecycle — 2026-09-21

Application commit `fb97fa5`.

| Repository migration                                | Hosted version   |
| --------------------------------------------------- | ---------------- |
| `20260921180000_delete_list_task_commands.sql`      | `20260921125204` |
| `20260921190000_lifecycle_function_permissions.sql` | `20260921125328` |

Verification found hosted default grants allowed **anonymous execution** of the
new functions. The follow-up migration removes PUBLIC/anon execution and
preserves authenticated execution on the public wrappers and private
implementations, matching existing `update_task` permissions. All four
functions were then verified: authenticated true, anon false. The declarative
grants were updated too, so rebuilding the local schema preserves access.

`supabase/smoke/lifecycle-smoke.sql` passed on production using randomly
generated synthetic identities in a transaction ending in ROLLBACK. It covers
unauthenticated rejection, assignment removal with the deadline preserved, task
deletion, list archival with tasks retained, stale-version conflicts, idempotent
retries, cross-household isolation and archived-list rejection. No real
household records were modified or returned.

Advisors: leaked-password protection disabled; three pre-existing unindexed
foreign keys and a missing primary key on `private.invitation_attempts`, all
unrelated to these commands.

The owner confirmed the matching Vercel production deployment and that task
deletion works in production. That is owner acceptance evidence; the deployment
connector did not independently supply a build identifier that session.

### Client-only follow-up

Commit `8c74b84` shipped the Android/web parity presentation. GitHub Quality
passed every job and Vercel deployed it. No migration was required.

## Task notes, date-only deadlines and task templates — 2026-09-21

| Migration                     | Hosted version   | Contents                                                                                                                    |
| ----------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `task_notes_templates`        | `20260921181652` | Notes column and constraints, household task-template table, note-aware task RPCs, template save/read RPCs, explicit grants |
| `task_template_creator_index` | `20260921181810` | Covering index for the template creator foreign key, after advisor review                                                   |

`supabase/smoke/task-features-smoke.sql` ran inside a transaction and rolled
back every synthetic user and household. It passed note creation and editing,
the 500-character boundary, idempotent replay, legacy update preservation,
household template isolation and cross-household task denial.

Privilege verification showed no direct table read for `anon` or
`authenticated`, no anonymous RPC execution, and authenticated execution only
for the scoped public RPCs. `task_templates` therefore intentionally uses
default-deny RLS with no direct policies.

Rollback requires a reviewed forward migration: revoke and drop the four new
public/private RPC pairs and the task-template table, then drop `tasks.notes`
only after confirming no notes must be retained.

## List templates and list notes — 2026-09-22

Migration `list_templates_and_notes`, hosted version `20260922060702`,
mirroring `supabase/migrations/20260922120000_list_templates_and_notes.sql`:
`lists.notes` and its constraint, the dropped `lists_template_seed_key`, the
note-aware `create_list_v2`/`update_list_v2`, `save_list_template`, a
note-carrying `copy_template`, a note-projecting `get_home`, and explicit
revokes and grants for the new functions.

`supabase/smoke/list-templates-smoke.sql` ran against the hosted project inside
a transaction forced to roll back; row counts before and after were identical.
It passed list-note creation, the 5,000-code-point boundary, legacy
`update_list` preserving an existing note, `update_list_v2` replacing it, saving
a list as a template with both of its tasks, the template carrying the list note
and the task notes, task runtime state being reset, idempotent replay, a
template not being saveable as a template, no task template being written,
`copy_template` carrying the note and tasks back, `get_home` projecting the
note, and cross-household denial.

Privilege verification showed the three new public wrappers are
`SECURITY INVOKER` with `search_path` pinned, their private helpers are
`SECURITY DEFINER`, `anon` can execute none of them, and `authenticated` can
execute exactly the pairs the migration grants. Advisors reported no new
finding.

Rollback requires a reviewed forward migration: revoke and drop
`create_list_v2`, `update_list_v2` and `save_list_template` with their private
helpers, restore the previous `copy_template` and `get_home` bodies, and drop
`lists.notes` only after confirming no note must be retained. Restoring
`lists_template_seed_key` first requires deleting or re-keying every
member-saved template.

## Deletable list templates — 2026-09-22

Migration `deletable_list_templates`, hosted version `20260922065428`,
mirroring `supabase/migrations/20260922140000_deletable_list_templates.sql`. It
replaces the body of `private.delete_list` only — no signature, DTO, error
code, grant or column change — so the generated contract types were unaffected
and not regenerated.

`supabase/smoke/list-templates-smoke.sql` grew the delete assertions and ran
against the hosted project inside a transaction forced to roll back, with
identical row counts before and after. It passed: a template deletes and comes
back `archived`, its tasks survive, it leaves `get_home`, `copy_template` on it
returns `NOT_FOUND`, a second delete returns `NOT_FOUND`, an active list still
deletes as before, a stale `expected_version` still returns `CONFLICT` rather
than deleting, and another household's list is still denied. Advisors reported
no new finding.

Rollback is a reviewed forward migration restoring `kind = 'active'` to the
`select` in `private.delete_list`. Templates archived in the meantime stay
archived and would need an operator to set `status` back to `open`.

## Task workflow — 2026-09-27

Application change viktorkachovski-cell/Odin#12. The database was migrated
before the web client merged, so production never ran a client against
missing RPCs.

| Repository migration                                    | Hosted version   |
| ------------------------------------------------------- | ---------------- |
| `20260927121823_task_workflow_polish.sql`               | `20260927193213` |
| `20260927154349_task_workflow_review_fixes.sql`         | `20260927193328` |
| `20260927194500_task_workflow_function_permissions.sql` | `20260927193412` |

**Dry run.** Both reviewed migrations and the smoke assertions first ran on the
hosted project in one transaction ended by a deliberate exception, so nothing
committed. They applied cleanly to live data: all 18 lists were backfilled with
no duplicate position within a household and kind, and every assertion passed.
The dry run also showed that hosted default privileges would let `anon`
execute the eight new public wrappers, which is why the third migration exists;
it follows the `lifecycle_function_permissions` precedent.

**After applying:**

- An md5 over `pg_get_functiondef` for the 26 functions the migrations create
  or replace matched a local stack built from the repository migrations
  exactly. Hashes of public columns and of all 35 public function signatures
  matched too, so `database.generated.ts` needed no regeneration.
- `anon` can execute no function in `public` or `private`; `authenticated` can
  execute all eight new public RPCs; no public function is `SECURITY DEFINER`;
  every function pins `search_path`.
- The deferrable `lists_household_kind_sort_order_key` and
  `tasks_list_id_sort_order_key`, `lists_sort_order_nonnegative` and
  `tasks_completed_blocked_exclusive` are present.
- As accepted in R11, each existing list gained one version and an
  `updated_at` equal to the migration time.

`supabase/smoke/task-workflow-smoke.sql` then passed on production using
randomly generated synthetic identities in a transaction ending in ROLLBACK. It
covers the unauthenticated guard, list append order from legacy and v2
commands, Open/Blocked/Done with display labels rejected, Blocked surviving a
text edit and cleared by the legacy completion command, task and list moves
with stale-version conflicts and boundary no-ops, template task moves with
state refused, runtime state reset by save-as-template and copy, the snapshot
reads and All Tasks filters, the legacy paged readers, and cross-household
denial. Users, profiles, households, memberships, lists, tasks and command
receipts counted the same before and after. One receipt had already been added
earlier in the window by a member's successful command against the live
database.

Advisors: security reports leaked-password protection disabled and
`task_templates` with RLS but no policies (intentional default-deny).
Performance reports three unindexed foreign keys, no primary key on
`private.invitation_attempts` and the unused `task_templates_created_by_idx`.
All pre-date these migrations.

The web client ships with the merge of viktorkachovski-cell/Odin#12 to `main`,
which Vercel deploys to production. No Android build containing the workflow
has been released; installed builds keep using the legacy RPCs, which the
smoke run exercised.

Rollback: the database changes are backward compatible with the previous web
deployment, so the web client can roll back on Vercel alone. Reverting the
database needs a reviewed forward migration that drops the new RPCs, the
`lists_assign_order` trigger and the new constraints, and restores the
previous command bodies; drop `tasks.blocked` and `lists.sort_order` only after
confirming no blocked state or household order must be kept.
