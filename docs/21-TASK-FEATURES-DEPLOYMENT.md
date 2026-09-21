# Task notes, date-only deadlines and templates

Production database: Supabase project `mvltbhtsukorspmpyhpw` in eu-central-1.

## Behavior

- Task titles allow 1–500 Unicode code points. List titles remain limited to 160.
- Notes are one shared, optional field up to 5,000 code points. Every active household member with normal task access can edit them; there is no author/timestamp thread.
- A date with no time resolves on the client to `23:59:59.999` in the device's local time zone and is stored as UTC. A time without a date is invalid.
- A household task template stores title and notes. Applying it clears assignee, deadline and completion.
- Legacy `create_task` and `update_task` RPCs remain callable for installed clients. `update_task` does not overwrite notes. Updated clients use additive `*_v2` RPCs.

## Production record — 2026-09-21

Applied migrations:

- `task_notes_templates` (hosted version `20260921181652`): notes column and constraints, household task-template table, note-aware task RPCs, template save/read RPCs and explicit grants.
- `task_template_creator_index` (hosted version `20260921181810`): covering index for the template creator foreign key after advisor review.

The production-safe smoke test in `supabase/tests/task-features-smoke.sql` ran inside a transaction and rolled back all synthetic users and household data. It passed note creation/editing, the 500-character boundary, idempotent replay, legacy update preservation, household template isolation and cross-household task denial.

Privilege verification showed no direct table read for `anon` or `authenticated`, no anonymous RPC execution, and authenticated execution only for the scoped public RPCs. `task_templates` therefore intentionally uses default-deny RLS with no direct policies.

Rollback requires a reviewed forward migration: revoke/drop the four new public/private RPC pairs and task-template table, then drop `tasks.notes` only after confirming no notes must be retained. Do not run a production reset or destructive rollback automatically.
