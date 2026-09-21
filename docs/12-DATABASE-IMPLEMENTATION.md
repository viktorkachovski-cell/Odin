# Database foundation implementation

## Implemented scope

The Odin backend now has a declarative PostgreSQL schema and pinned Supabase CLI workflow. It covers profiles, households, one-household membership, template/active lists, tasks, command receipts, invitation lifecycle, RLS, client grants, Realtime publication, safe read projections and transactional mutation RPCs.

Confirmed product invariants are enforced in SQL: one nullable assignee, deadlines only on tasks, copy-reset semantics, household isolation, equal member task permissions and explicit completion state. Writes use actor-scoped request IDs and expected versions. Assignment and claim operations use deterministic locks; clients cannot bypass them with direct table writes.

## Security and reliability decisions

- Authorization reads current active membership instead of JWT metadata, so membership revocation takes effect without waiting for token refresh.
- Member identity reads expose display name/avatar only; another member's locale and email are not returned.
- Public RPCs are invokers. Private definer helpers use fixed empty search paths, explicit actor/household checks and exact grants.
- Invitation tokens use a database-only HMAC secret and are stored only as hashes. Idempotent retries rederive the same token.
- Realtime is an invalidation channel; protected tables retain RLS. Managed Realtime schema objects are untouched.
- Keyset cursors cap result pages at 50 rows. Aggregate progress counts all tasks, not only the loaded page.

## Tests supplied

`001_schema.sql` checks tables, deadline/assignee nullability, RLS, direct-write denial and RPC presence. `002_behavior.sql` checks profile/household creation, one-household enforcement, input validation, idempotency mismatch, template copy/reset, invitations, claim/completion/progress, stale versions, member projection and cross-household denial. `concurrency.mjs` opens genuine parallel transactions to prove duplicate creates produce one entity and receipt, competing claims produce one winner, and simultaneous appends receive distinct consecutive positions. A Node regression suite checks critical SQL boundaries without requiring Docker.

The reviewed initial migration is committed at `supabase/migrations/20260919160111_initial_odin_schema.sql`. It was generated from declarative state with strict coverage using the current `db schema declarative sync` command. The database GitHub workflow replays committed migrations into a disposable Supabase stack, runs database lint with warnings configured to fail the job, then runs pgTAP and parallel-transaction tests. Docker or Podman is not installed on the current Windows machine, so replay evidence comes from GitHub's disposable runner. A local generation attempt confirmed that limitation; it did not change a database.

The first CI execution generated the schema and passed database lint plus all 28 structural assertions. Its behavior suite exposed a missing EXECUTE grant on safe response helpers used by invoker read RPCs. The grants were narrowed to the four pure response/cursor helpers and a static regression check was added before rerunning the suite.

A later lint review found an invalid cross-statement reference to the `get_home` page CTE and an overly strong `IMMUTABLE` declaration on cursor decoding. The page aggregation and last-row lookup now share one statement, cursor decoding is `STABLE`, regression checks cover both findings, and database lint warnings now fail CI.

## Compatibility note

The shared contract remains behaviorally unchanged. Invitation generation was resolved inside Postgres rather than requiring an Edge Function: `create_invitation(request_id)` returns the opaque token, while the database stores only its hash and a rederivable invitation ID. Clients still receive one expiring link and retry the same request safely.

## Remaining hosted and product decisions

- Production English/Bulgarian template wording is not approved, so seed tables are empty.
- Member removal/account deletion authority and recovery remain undefined; no removal RPC was added.
- The owner selected one hosted production environment: Supabase project `mvltbhtsukorspmpyhpw` in `eu-central-1`. A separate staging project is intentionally out of scope for this private hobby project.
- Generated TypeScript types are committed at `packages/contracts/src/database.generated.ts` and are consumed by both clients.
- Production Auth redirect URLs are configured for the Vercel domain. SMTP confirmation/recovery delivery remains a hosted operational dependency and still needs real-inbox verification.

## Production rollout record

The hosted lifecycle migrations and task notes/template migrations were applied
without resets or data replacement. Transactional production smoke tests passed
for household isolation, assignment removal, task/list lifecycle, notes,
templates, idempotent replay and stale-version conflicts. See
`docs/19-PRODUCTION-LIFECYCLE-DEPLOYMENT.md` and
`docs/21-TASK-FEATURES-DEPLOYMENT.md` for migration IDs and the exact checks.

These are release dependencies. None justified changing a confirmed functional requirement.
