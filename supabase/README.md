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
npm run db:stop -- --no-backup
```

The checked-in CLI is pinned in `package.json`; use it through npm/npx. `db reset` is allowed only against the disposable local Odin stack. Never use reset against staging or production.

## Client permissions

The `authenticated` role can select RLS-filtered rows and execute public RPCs. It has no direct insert/update/delete privileges. `anon` receives no application table or RPC access. Private tables are not exposed through PostgREST.

| Public RPC                   | Private helper                   | Security boundary                                                            |
| ---------------------------- | -------------------------------- | ---------------------------------------------------------------------------- |
| `update_profile`             | `private.update_profile`         | Own Auth user only; validated display name/locale                            |
| `create_household`           | `private.create_household`       | One active household; user lock; versioned seed copy                         |
| `create_list`, `update_list` | matching private helper          | Active membership; active lists only; optimistic version                     |
| `copy_template`              | `private.copy_template`          | One transaction; source unchanged; runtime fields reset                      |
| `create_task`, `update_task` | matching private helper          | Active list/member locks; same-household assignee                            |
| `set_task_completed`         | matching private helper          | Explicit desired state; optimistic version                                   |
| `claim_task`                 | matching private helper          | Incomplete and unassigned under row lock                                     |
| `create_invitation`          | matching private helper          | Creator active; 10/hour; database-generated token; 72-hour default           |
| `redeem_invitation`          | matching private helper          | Authenticated, single use, expiry/revocation and 10-failures/15-minute limit |
| `revoke_invitation`          | matching private helper          | Creator-only proposed default                                                |
| read RPCs                    | safe invoker/definer projections | Active household only; no email, locale or token disclosure                  |

All privileged helpers pin an empty `search_path`, derive the actor from `auth.uid()`, and are inaccessible through the exposed API schema. Public wrappers remain `SECURITY INVOKER`. Mutation receipts are scoped to actor/request ID; payload mismatches fail. Successful household-scoped receipts are not replayed after membership loss.

Invitation raw tokens are never stored. A private random HMAC key is generated inside each database at runtime; a token can be deterministically rederived for an idempotent create retry. Database backups therefore contain the HMAC key and must be protected as secrets. Rotating that key invalidates outstanding invitations and requires a deliberate operational procedure.

## Seed content

`seed.sql` intentionally contains no production templates because English/Bulgarian wording is awaiting product-owner approval. `private.seed_lists` and `private.seed_tasks` are ready for a reviewed, versioned seed migration. Empty seed tables do not block household creation; the new household starts without templates until content is approved.

## Hosted rollout

Before creating or linking a hosted project, select the Odin Supabase organization, region, plan and staging/production arrangement. Then:

1. Recheck current Supabase access and cost.
2. Create a separate Odin staging project; never link to Passport.
3. Apply the committed migration with `supabase db push`.
4. Generate types into `packages/contracts/src/database.generated.ts` and commit them without hand edits.
5. Run database tests and security/performance advisors; resolve or document every finding.
6. Configure production SMTP, exact Auth redirects and OTP delivery tests before release.

No hosted database was created or mutated by this implementation.
