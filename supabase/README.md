# Odin database

This directory is the reproducible Supabase/Postgres backend for Odin. It is not linked to the Passport project and must never be pushed there.

## Source of truth

The ordered declarative schema in `schemas/` is authoritative:

1. `00_core.sql` — tables, constraints, indexes and integrity triggers.
2. `01_security.sql` — authorization helpers, idempotency primitives and RLS.
3. `02_commands.sql` — transactional mutations and public RPC wrappers.
4. `03_reads.sql` — safe projections and keyset-paginated reads.
5. `04_grants_and_realtime.sql` — least-privilege grants and publication membership.

Do not edit generated migrations to make schema changes. Edit declarative files, run `npm run db:diff -- -f <descriptive_name>`, review the generated migration, replay locally and commit both. The pinned CLI routes this through `supabase db schema declarative sync`; ordinary `supabase db diff` no longer reads declarative `schema_paths`. Supabase's diff engine does not reliably track publication membership or all grants/policies, so review those statements explicitly after every generation.

## Local workflow

Prerequisites are Node 22+, a Docker-compatible runtime and enough disk for the Supabase stack.

```sh
npm ci
npm run db:diff -- -f initial_odin_schema
npm run db:start
npm run db:lint
npm run db:test
npm run db:test:concurrency
npm run db:stop -- --no-backup
```

The checked-in CLI is pinned in `package.json`; use it through npm/npx. `db reset` is allowed only against the disposable local Odin stack. Never use reset against staging or production.

## Client permissions

The `authenticated` role can select RLS-filtered rows and execute public RPCs. It has no direct insert/update/delete privileges. `anon` receives no application table or RPC access. Private tables are not exposed through PostgREST.

| Public RPC                         | Private helper                   | Security boundary                                                                 |
| ---------------------------------- | -------------------------------- | --------------------------------------------------------------------------------- |
| `update_profile`                   | `private.update_profile`         | Own Auth user only; validated display name/locale                                 |
| `create_household`                 | `private.create_household`       | One active household; user lock; versioned seed copy                              |
| `create_list`, `update_list`       | matching private helper          | Active membership; active lists only; optimistic version                          |
| `create_list_v2`, `update_list_v2` | matching private helper          | As above plus the shared list note; legacy pair stays note-preserving             |
| `save_list_template`               | `private.save_list_template`     | One transaction; active/open source unchanged; tasks copied without runtime state |
| `copy_template`                    | `private.copy_template`          | One transaction; source unchanged; runtime fields reset                           |
| `delete_list`                      | `private.delete_list`            | Archives any open list, template or active; optimistic version; tasks kept        |
| `delete_task`                      | `private.delete_task`            | Permanent; active/open parent only; optimistic version                            |
| `create_task`, `update_task`       | matching private helper          | Active list/member locks; same-household assignee                                 |
| `set_task_completed`               | matching private helper          | Explicit desired state; optimistic version                                        |
| `claim_task`                       | matching private helper          | Incomplete and unassigned under row lock                                          |
| `create_invitation`                | matching private helper          | Creator active; 10/hour; database-generated token; 72-hour default                |
| `redeem_invitation`                | matching private helper          | Authenticated, single use, expiry/revocation and 10-failures/15-minute limit      |
| `revoke_invitation`                | matching private helper          | Creator-only proposed default                                                     |
| read RPCs                          | safe invoker/definer projections | Active household only; no email, locale or token disclosure                       |

All privileged helpers pin an empty `search_path`, derive the actor from `auth.uid()`, and are inaccessible through the exposed API schema. Public wrappers remain `SECURITY INVOKER`. Mutation receipts are scoped to actor/request ID; payload mismatches fail. Successful household-scoped receipts are not replayed after membership loss.

Invitation raw tokens are never stored. A private random HMAC key is generated inside each database at runtime; a token can be deterministically rederived for an idempotent create retry. Database backups therefore contain the HMAC key and must be protected as secrets. Rotating that key invalidates outstanding invitations and requires a deliberate operational procedure.

## Seed content

`seed.sql` intentionally contains no production templates, and **owner decision 2026-09-22 settles that as the intended behaviour**: a new household starts empty and builds its own templates by saving a list it actually uses. This is no longer an open approval. `private.seed_lists` and `private.seed_tasks` stay in the schema so a reviewed, versioned seed migration remains possible if the owner ever reverses that, and empty seed tables do not block household creation.

## Hosted rollout

Before creating or linking a hosted project, select the Odin Supabase organization, region and plan. The environment arrangement is settled: one hosted project, treated as production. Then:

1. Recheck current Supabase access and cost.
2. Create the Odin project; never link to Passport. (Done: `mvltbhtsukorspmpyhpw`.)
3. Apply the committed migration with `supabase db push`.
4. Generate types into `packages/contracts/src/database.generated.ts` and commit them without hand edits.
5. Run database tests and security/performance advisors; resolve or document every finding.
6. Configure production SMTP and run confirmation/recovery delivery tests before release.

### Hosted status

A hosted project has since been created and this schema applied to it, on the
user's explicit instruction, so the clients have a backend to run against.

**Owner decision (2026-09-20): this is the production database.** Odin runs a
single hosted environment because it is a private, single-owner hobby project;
see `docs/architecture.md`. Vercel previews therefore read and write the same
data as production, which is an accepted trade, not an oversight. Recorded for
the next agent:

- Supabase project `Odin` (`mvltbhtsukorspmpyhpw`), region `eu-central-1`, in the
  only available organization. Passport was not touched, and must never be.
- `schemas/00_core.sql` … `04_grants_and_realtime.sql` were applied in order as
  migrations of the same names. The deployed function set was verified against
  these files afterwards: 18 public RPCs with matching argument names and
  security modes, and the privileged helpers (`invitation_token`,
  `invitation_secret`, `save_command`, `replay_command`, `normalized_text`,
  `command_hash`) not executable by `authenticated`.
- Types were regenerated into `packages/contracts/src/database.generated.ts`.
- `seed.sql` stays empty, so a new household starts with no templates. That is
  intended, not pending: see the seed-content note above.
- Verification fixtures (three `@example.invalid` accounts and their data) were
  created and then deleted. The project has since been in real use and holds
  live household data, so treat it as production: never reset it, and run
  verification only through the rollback-wrapped scripts in `smoke/`.

This project is the backend for the Vercel production deployment and its
previews of the web client. A build logs the host it targets (`[odin] building against
<project-ref>.supabase.co`), so the Vercel build log shows which project a given
deployment talks to; see `docs/operations.md`.

The two-backend concurrency suite does run: `npm run db:test:concurrency`
executes in the `Database` workflow's `verify` job against a real local stack,
alongside `supabase db lint` and the pgTAP suite. Three races from
`docs/contract.md` are nonetheless still uncovered — assignment racing
membership revocation, two concurrent `create_household` calls for one account,
and two accounts redeeming one invitation simultaneously.

Migrations applied after the initial rollout, newest last:
`delete_list_task_commands`, `lifecycle_function_permissions`,
`task_notes_templates`, `task_template_creator_index`,
`list_templates_and_notes`, `deletable_list_templates`. Each is recorded with
its smoke run and advisor review in the matching `docs/` file.

Still outstanding: SMTP confirmation/recovery delivery configuration and any
additional real-inbox delivery tests. Auth redirect allowlists for the
production web routes are configured. A separate production project is no
longer outstanding -- it was deliberately ruled out above.
