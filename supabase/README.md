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

The `authenticated` role can select RLS-filtered rows and execute public RPCs. It has no direct insert/update/delete privileges. `anon` receives no application table or RPC access. Private tables are not exposed through PostgREST. `task_assignees` has RLS enabled and deliberately no policy and no grant: assignments reach clients only inside task payloads and change only through the assignment commands.

| Public RPC                                                       | Private helper                   | Security boundary                                                                                                                                                             |
| ---------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `update_profile`                                                 | `private.update_profile`         | Own Auth user only; validated display name/locale                                                                                                                             |
| `create_household`                                               | `private.create_household`       | One active household; user lock; versioned seed copy                                                                                                                          |
| `create_list`, `update_list`                                     | matching private helper          | Active membership; creates active lists, updates either kind; optimistic version                                                                                              |
| `create_list_v2`, `update_list_v2`                               | matching private helper          | As above plus the shared list note; legacy pair stays note-preserving                                                                                                         |
| `save_list_template`                                             | `private.save_list_template`     | One transaction; active/open source unchanged; tasks copied without runtime state                                                                                             |
| `copy_template`                                                  | `private.copy_template`          | One transaction; source unchanged; runtime fields reset                                                                                                                       |
| `delete_list`                                                    | `private.delete_list`            | Archives any open list, template or active; optimistic version; tasks kept                                                                                                    |
| `delete_task`                                                    | `private.delete_task`            | Permanent; open parent of either kind; parent list lock; optimistic version                                                                                                   |
| `delete_completed_tasks`                                         | `private.delete_completed_tasks` | Permanent; one active/open list; list then task locks; all-or-nothing versions                                                                                                |
| `create_task`, `update_task`, `create_task_v2`, `update_task_v2` | matching private helper          | Installed-client single-assignee commands; store a zero/one-member set; never reduce several assignees to one (`CONFLICT`); none, and no deadline, on a template              |
| `create_task_v3`, `update_task_v3`                               | matching private helper          | Complete assignment set, canonicalised before hashing; member locks then list/task; all-or-nothing on an inactive, unknown or foreign id; `update_task_v3` is version-checked |
| `set_task_assignees`                                             | `private.set_task_assignees`     | Replaces only the set under `expected_version`; empty set clears everyone; active lists only                                                                                  |
| `add_task_assignee`, `remove_task_assignee`                      | matching private helper          | One member, no version, commutative and idempotent; member locks then task row; active lists only                                                                             |
| `get_task_v2`                                                    | `private.get_task_v2`            | One task with its assignment set; open parent in the caller's household else `NOT_FOUND`                                                                                      |
| `set_task_completed`                                             | matching private helper          | Explicit desired state; optimistic version                                                                                                                                    |
| `set_task_state`                                                 | matching private helper          | Open/blocked/done; never touches assignee; parent list lock; optimistic version                                                                                               |
| `move_list`, `move_task`                                         | matching private helpers         | Adjacent swap within kind/completion group; lock, then version check                                                                                                          |
| `claim_task`                                                     | matching private helper          | Legacy: incomplete and with no assignees, under row lock                                                                                                                      |
| `create_invitation`                                              | matching private helper          | Creator active; 10/hour; database-generated token; 72-hour default                                                                                                            |
| `redeem_invitation`                                              | matching private helper          | Authenticated, single use, expiry/revocation and 10-failures/15-minute limit                                                                                                  |
| `revoke_invitation`                                              | matching private helper          | Creator-only proposed default                                                                                                                                                 |
| read RPCs                                                        | safe invoker/definer projections | Active household only; no email, locale or token disclosure                                                                                                                   |
| `get_home_v2`, `get_list_v2`                                     | matching private readers         | One snapshot each; shared list order; `TOO_LARGE` above 1,000 rows; lists carry their `project_id`                                                                            |
| `create_project`, `update_project`, `delete_project`             | matching private helper          | Any active member; list-ordering lock then project row; `update`/`delete` version-checked; delete ungroups every list and deletes none                                        |
| `create_list_v3`, `set_list_project`                             | matching private helper          | A list inside a project in one transaction, or moved in/out under `expected_version`; project row `FOR SHARE` before the list; templates and archived lists `NOT_FOUND`       |
| `get_projects`                                                   | `private.get_projects`           | One snapshot, alphabetical, with open active list counts; `TOO_LARGE` above 1,000                                                                                             |
| `get_my_tasks_v2`, `get_unassigned_v2`, `get_all_tasks`          | `private.get_household_tasks`    | One reader, three scopes; full task rows plus list title; `TOO_LARGE` ceiling                                                                                                 |

All privileged helpers pin an empty `search_path`, derive the actor from `auth.uid()`, and are inaccessible through the exposed API schema. Public wrappers remain `SECURITY INVOKER`. Mutation receipts are scoped to actor/request ID; payload mismatches fail. Successful household-scoped receipts are not replayed after membership loss.

Invitation raw tokens are never stored. A private random HMAC key generated inside each database lets a token be rederived for an idempotent create retry; backups therefore contain the key (risk R6).

## Seed content

`seed.sql` contains no templates: a new household starts empty and saves its own (owner decision 2026-09-22, `docs/decisions.md` item 4). `private.seed_lists` and `private.seed_tasks` stay in the schema so a reviewed, versioned seed migration remains possible, and empty seed tables do not block household creation.

## Hosted state

One hosted project, `mvltbhtsukorspmpyhpw` in `eu-central-1`, treated as production and holding live household data; never reset it. Local replay and CI never change hosted state, and Vercel previews use the same backend (`docs/architecture.md`). What is applied there, with smoke evidence, is `docs/deployment-log.md`; how to apply a change is `docs/operations.md`; open risks are `docs/known-risks.md`.
