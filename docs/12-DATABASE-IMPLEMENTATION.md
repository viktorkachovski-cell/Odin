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

`001_schema.sql` checks tables, deadline/assignee nullability, RLS, direct-write denial and RPC presence. `002_behavior.sql` checks profile/household creation, one-household enforcement, input validation, idempotency mismatch, template copy/reset, invitations, claim/completion/progress, stale versions, member projection and cross-household denial. A Node regression suite checks critical SQL boundaries without requiring Docker.

The database GitHub workflow generates the migration from declarative state with strict coverage using the current `db schema declarative sync` command, starts a disposable Supabase stack, runs database lint and pgTAP, and uploads the generated migration. This is needed because Docker or Podman is not installed on the current Windows machine. A local generation attempt confirmed that limitation; it did not change a database.

## Compatibility note

The shared contract remains behaviorally unchanged. Invitation generation was resolved inside Postgres rather than requiring an Edge Function: `create_invitation(request_id)` returns the opaque token, while the database stores only its hash and a rederivable invitation ID. Clients still receive one expiring link and retry the same request safely.

## Not completed or awaiting decisions

- Production English/Bulgarian template wording is not approved, so seed tables are empty.
- Member removal/account deletion authority and recovery remain undefined; no removal RPC was added.
- Hosted Odin organization, region, plan and staging/production split remain unselected. No hosted project was created, linked or changed.
- Generated TypeScript types require a running or hosted Odin database and will be produced after the generated migration replays successfully.
- Production SMTP and Auth redirect configuration remain release work.

These are release dependencies. None justified changing a confirmed functional requirement.
