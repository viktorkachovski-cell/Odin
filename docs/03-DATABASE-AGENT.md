# Database implementation agent

## Mission and inputs

Implement the Odin Supabase backend defined in `00-ARCHITECTURE.md`, `01-DECISIONS.md`, and `02-CONTRACT.md`. Read `06-CODE-STANDARDS.md` and `08-VERIFICATION.md`. Deliver executable schema, migrations, seed fixtures, RPCs, authorization tests, generated TypeScript types and a reproducible local setup. Do not deploy to Passport or create paid resources without the selected Odin organization/plan.

## Files owned

Own `supabase/**`, `packages/contracts/src/database.generated.ts`, backend integration tests and backend setup documentation. Coordinate changes to shared DTOs with the bootstrap/client implementers. Do not modify UI designs or change product permissions.

## Ordered work

1. Inspect repository state and installed Supabase CLI `--help`/version. Initialize a local Odin project. Use a disposable local Docker database. Record exact runtime versions and commands; never run reset against hosted project URLs.
2. Create desired schema files under `supabase/schemas/` and configure declarative schema paths. Generate and review migrations using the installed CLI's documented diff workflow. Keep policies, grants, indexes, functions and constraints in version control. Never edit a migration already applied to a shared environment.
3. Implement tables and constraints from the contract. Use seeded demo users only locally. Keep household-specific English/Bulgarian seed manifests under source control; do not import real family content. Use stable `seed_key` identities so retries cannot seed duplicate templates.
4. Implement authorized reads and transaction commands. Deny client direct INSERT/UPDATE/DELETE on protected tables so callers cannot bypass receipt/version checks.
5. Add idempotency and simultaneous-edit tests before exposing commands to the clients. Generate and commit TypeScript database types after final local migration; do not hand-edit generated types.
6. Enable supported Realtime publication for required tables; test with actual user JWT subscriptions and cross-household denial. Do not modify Supabase's managed Realtime schema.
7. Implement onboarding/invitation commands under the proposed defaults, isolating configurable expiry and rate limits. If those defaults are not approved for release, mark them as release blockers instead of silently changing permissions.
8. Run local reset/replay, database tests, concurrency suite, generated-type drift check, database lint and security/performance advisors where available. Review advisor findings rather than disabling warnings wholesale.

## Authorization implementation

Every exposed table has RLS enabled with explicit least-privilege grants. No unauthenticated household reads. The caller must have active membership in the row's household. Client-supplied user IDs never substitute for `auth.uid()`.

Avoid recursive membership RLS: implement a private, narrowly scoped membership predicate using a fixed empty search path and fully qualified objects. Read policies call it; it returns a boolean only. Test that callers cannot enumerate foreign membership through it. Never authorize from user-editable metadata.

Public command wrappers use `SECURITY INVOKER` and call private command helpers where privileged writes are necessary. Helpers may use `SECURITY DEFINER` only with a deliberately restricted owner, fixed search path, explicit authentication/active-membership checks, strict input validation, and no dynamic SQL. Revoke default EXECUTE from PUBLIC and anon; grant only the exact authenticated wrapper/helper functions necessary. Private helper schema is not exposed to PostgREST. Grant schema USAGE deliberately if invoker wrappers require it. Treat every callable helper as a security boundary even when private. Do not use a definer function merely to make a permission error disappear.

Maintain a function/grant matrix in `supabase/README.md`: owner, security mode, callable roles, authorization checks and tests. Read views use `security_invoker = true`. Keep profiles' own preferences separated from the household-visible identity projection. Do not use broad `profiles SELECT` just to render avatars.

## Required database checks

- Nonblank Unicode-trimmed titles and agreed length limits; null and empty subtitle normalization.
- One active household per user; inactive members cannot read, mutate, subscribe or receive an assignment.
- Same-household composite FKs prevent task/list/assignee mismatches even through a buggy privileged command.
- Template tasks cannot gain completion, due date or assignee; active commands cannot edit template content.
- Server-managed timestamps/version/creator/household fields cannot be forged.
- Null deadlines allowed; timestamps are instants; no list deadline anywhere in SQL or DTOs.
- Copy is all-or-nothing, source untouched, order preserved, runtime fields reset; empty template copy succeeds.
- Two simultaneous identical copy/create requests yield one entity and one receipt. Same ID/different payload is rejected. Rollback leaves no partial receipt or copy.
- Different legitimate request IDs may create separate copies: do not deduplicate by template/title.
- Simultaneous claims produce one assignee; stale editors and repeated completion are safe. Explicit desired completion is never inverted by retry.
- Assignment and revocation cannot race to leave an inactive assignee.
- Invitation expiration is server-clock based, redemption single-use and atomic, concurrent different-household joins cannot bypass one-household limit. Rate-limit create/redeem in a server-controlled store; propose initial 10 creates/hour/member and 10 failed redemptions/15 minutes/account, configurable and reviewed before release.
- On deactivation, deny access even with an unexpired old JWT; tests also prove receipt replay cannot leak old household data.

## Index and query plan baseline

Index memberships by active user, lists by household/kind/status, tasks by household/list/completed/sort_order/id, and partial incomplete-task indexes for `(household_id, assignee_id, due_at, id)`. Index receipt identity and token hashes uniquely. Inspect `EXPLAIN (ANALYZE, BUFFERS)` on representative synthetic data before adding overlapping indexes. No stored progress percentage; compute counts efficiently over authorized tasks.

## Environment and secrets

Document public project URL/publishable key separately from server secrets. Email OTP requires provider configuration, rate limits, resend cooldown, valid custom email templates and delivery tests. Edge Functions, if used for secret-backed invitation generation, validate the end user's token and call commands with that user's context; a service key is not a substitute for caller authorization.

Use initials for avatars in MVP, so Storage is unnecessary. If avatar upload is later approved, add a private bucket with household-scoped policies and signed delivery; never a public bucket containing family information.

## Handoff and done

Deliver a clean local migration replay; a safe staging migration plan; rollback/recovery notes; generated types; a command reference with request/response examples; seed version manifest; and evidence for every DB-owned case in `08-VERIFICATION.md`. Provide client agents a tested staging URL and public key only after the staging project is authorized and created. Do not claim hosted setup is complete while only local SQL exists.

Suggested agent prompt: “Implement `docs/03-DATABASE-AGENT.md` exactly, preserving `docs/02-CONTRACT.md`. Complete local schema and authorization/concurrency tests, record evidence, and stop only dependent hosted provisioning when organization, cost or release policy remains unresolved.”
