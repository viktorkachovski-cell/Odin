# Odin database

This directory is the reproducible Supabase/Postgres backend for Odin. It is not linked to the Passport project and must never be pushed there.

## Source of truth

The ordered declarative schema in `schemas/` is authoritative:

1. `00_core.sql` — tables, constraints, indexes and integrity triggers.
2. `01_security.sql` — authorization helpers, idempotency primitives and RLS.
3. `02_commands.sql` — transactional mutations and public RPC wrappers.
4. `03_reads.sql` — authorized snapshot reads and legacy keyset readers.
5. `04_grants_and_realtime.sql` — least-privilege grants and publication membership.

Edit declarative files first, run `npm run db:diff -- -f <descriptive_name>`, review the generated migration, replay locally and commit both. A generated migration may need a reviewed data backfill before a new constraint: `20260927121823_task_workflow_polish.sql` assigns positions to existing lists before adding their unique order constraint. The pinned CLI routes this through `supabase db schema declarative sync`; ordinary `supabase db diff` no longer reads declarative `schema_paths`. Supabase's diff engine does not reliably track publication membership or all grants/policies, so review those statements explicitly after every generation.

## Local workflow

Prerequisites are Node 22+, a Docker-compatible runtime and enough disk for the Supabase stack.

```sh
npm ci
npm run db:start
npm run db:lint
npm run db:test
npm run db:test:concurrency
npm run db:stop -- --no-backup
```

The checked-in CLI is pinned in `package.json`; use it through npm/npx. `db reset` is allowed only against the disposable local Odin stack. Never use reset against staging or production.

## Client permissions

The `authenticated` role can select RLS-filtered rows and execute public RPCs. It has no direct insert/update/delete privileges. `anon` receives no application table or RPC access. Private tables are not exposed through PostgREST.

| Public RPC                                              | Private helper                   | Security boundary                                                                 |
| ------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------- |
| `update_profile`                                        | `private.update_profile`         | Own Auth user only; validated display name/locale                                 |
| `create_household`                                      | `private.create_household`       | One active household; user lock; versioned seed copy                              |
| `create_list`, `update_list`                            | matching private helper          | Active membership; active lists only; optimistic version                          |
| `create_list_v2`, `update_list_v2`                      | matching private helper          | As above plus the shared list note; legacy pair stays note-preserving             |
| `save_list_template`                                    | `private.save_list_template`     | One transaction; active/open source unchanged; tasks copied without runtime state |
| `copy_template`                                         | `private.copy_template`          | One transaction; source unchanged; runtime fields reset                           |
| `delete_list`                                           | `private.delete_list`            | Archives any open list, template or active; optimistic version; tasks kept        |
| `delete_task`                                           | `private.delete_task`            | Permanent; active/open parent only; parent list lock; optimistic version          |
| `create_task`, `update_task`                            | matching private helper          | Active list/member locks; same-household assignee                                 |
| `set_task_completed`                                    | matching private helper          | Explicit desired state; optimistic version                                        |
| `set_task_state`                                        | matching private helper          | Open/blocked/done; never touches assignee; parent list lock; optimistic version   |
| `move_list`, `move_task`                                | matching private helpers         | Adjacent swap within kind/completion group; lock, then version check              |
| `claim_task`                                            | matching private helper          | Incomplete and unassigned under row lock                                          |
| `create_invitation`                                     | matching private helper          | Creator active; 10/hour; database-generated token; 72-hour default                |
| `redeem_invitation`                                     | matching private helper          | Authenticated, single use, expiry/revocation and 10-failures/15-minute limit      |
| `revoke_invitation`                                     | matching private helper          | Creator-only proposed default                                                     |
| read RPCs                                               | safe invoker/definer projections | Active household only; no email, locale or token disclosure                       |
| `get_home_v2`, `get_list_v2`                            | matching private readers         | One snapshot each; shared list order; `TOO_LARGE` above 1,000 rows                |
| `get_my_tasks_v2`, `get_unassigned_v2`, `get_all_tasks` | `private.get_household_tasks`    | One reader, three scopes; full task rows plus list title; `TOO_LARGE` ceiling     |

All privileged helpers pin an empty `search_path`, derive the actor from `auth.uid()`, and are inaccessible through the exposed API schema. Public wrappers remain `SECURITY INVOKER`. Mutation receipts are scoped to actor/request ID; payload mismatches fail. Successful household-scoped receipts are not replayed after membership loss.

Invitation raw tokens are never stored. A private random HMAC key is generated inside each database at runtime; a token can be deterministically rederived for an idempotent create retry. Database backups therefore contain the HMAC key and must be protected as secrets. Rotating that key invalidates outstanding invitations and requires a deliberate operational procedure.

## Seed content

`seed.sql` intentionally contains no production templates, and **owner decision 2026-09-22 settles that as the intended behaviour**: a new household starts empty and builds its own templates by saving a list it actually uses. This is no longer an open approval. `private.seed_lists` and `private.seed_tasks` stay in the schema so a reviewed, versioned seed migration remains possible if the owner ever reverses that, and empty seed tables do not block household creation.

## Hosted state

Odin has one hosted Supabase project, `mvltbhtsukorspmpyhpw` in
`eu-central-1`, treated as production. It contains live household data; never
reset it. The three task-workflow migrations were applied there on
2026-09-27. Local schema replay and CI never change hosted state. Vercel
previews use the same production backend, so a preview can only exercise RPCs
that are already applied there.

For the exact hosted migration history and smoke-test evidence, use
`docs/deployment-log.md`. For deployment sequencing, build configuration and
post-deployment checks, use `docs/operations.md`. Open risks, including the
remaining concurrency gaps and preview access to production, are in
`docs/known-risks.md`.
