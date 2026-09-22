# Database

The Supabase/Postgres backend in `supabase/`. The API it exposes is
`contract.md`; how to deploy a change to it is `operations.md`; what has been
deployed is `deployment-log.md`.

`supabase/README.md` holds the working details: file order, local workflow, the
RPC/helper matrix and the hosted status. This file is the design and the rules
that must not be broken.

## Implemented scope

A declarative PostgreSQL schema with a pinned Supabase CLI workflow, covering
profiles, households, one-household membership, template and active lists,
tasks, command receipts, invitation lifecycle, RLS, client grants, Realtime
publication, safe read projections and transactional mutation RPCs.

The confirmed product invariants are enforced **in SQL**, not only in clients:
one nullable assignee, deadlines only on tasks, copy-reset semantics, household
isolation, equal member task permissions and explicit completion state. Writes
carry actor-scoped request IDs and expected versions. Assignment and claim use
deterministic locks, and clients cannot bypass them with direct table writes.

## Authorization design

These are the rules a change must preserve.

- Every exposed table has RLS enabled with explicit least-privilege grants.
  There are no unauthenticated household reads. The caller must hold active
  membership in the row's household, and a client-supplied user ID never
  substitutes for `auth.uid()`.
- Authorization reads **current active membership**, not JWT metadata, so
  revoking membership takes effect without waiting for a token refresh.
- Recursive membership RLS is avoided: a private, narrowly scoped membership
  predicate with a fixed empty search path and fully qualified objects returns
  a boolean, and read policies call it. Callers cannot enumerate foreign
  membership through it. Never authorize from user-editable metadata.
- Public command wrappers are `SECURITY INVOKER` and call private helpers.
  A helper may be `SECURITY DEFINER` only with a restricted owner, a fixed
  search path, explicit authentication and active-membership checks, strict
  input validation and no dynamic SQL. Default EXECUTE is revoked from PUBLIC
  and `anon`; only the exact authenticated wrapper and helper functions are
  granted. The private schema is not exposed to PostgREST.
- Treat every callable helper as a security boundary even when private. Never
  use a definer function merely to make a permission error disappear.
- Read views use `security_invoker = true`. Member identity reads expose
  display name and avatar only — never another member's locale or email. Own
  profile preferences stay separate from the household-visible projection.
- Invitation tokens use a database-only HMAC secret and are stored only as
  hashes; an idempotent retry rederives the same token. Database backups
  therefore contain that key — risk R6 in `known-risks.md`.
- Realtime is an invalidation channel, not a source of truth. Protected tables
  keep RLS and managed Realtime schema objects are untouched.
- Keyset cursors cap pages at 50 rows. Aggregate progress counts all tasks, not
  only the loaded page.

Keep the function/grant matrix in `supabase/README.md` current: owner, security
mode, callable roles, authorization checks and tests.

## Invariants the tests must keep proving

- Non-blank Unicode-trimmed titles and the agreed length limits; null and empty
  subtitle normalization.
- One active household per user. An inactive member cannot read, mutate,
  subscribe or receive an assignment, even with an unexpired old JWT, and
  receipt replay after membership loss reveals nothing.
- Same-household composite foreign keys prevent task/list/assignee mismatches
  even through a buggy privileged command.
- Template tasks cannot gain completion, a due date or an assignee.
- Server-managed timestamp, version, creator and household fields cannot be
  forged.
- Null deadlines are allowed; timestamps are instants; no list deadline exists
  anywhere in SQL or the DTOs.
- Copy is all-or-nothing: source untouched, order preserved, runtime fields
  reset, and an empty template copies successfully.
- Two simultaneous identical create or copy requests yield one entity and one
  receipt. The same ID with a different payload is rejected. A rollback leaves
  no partial receipt or copy. Different legitimate request IDs may create
  separate copies — do not deduplicate by template or title.
- Simultaneous claims produce one assignee. Stale editors and repeated
  completion are safe, and an explicit desired completion is never inverted by
  a retry.
- Invitation expiry is server-clock based, redemption is single-use and atomic,
  and concurrent different-household joins cannot bypass the one-household
  limit. Create and redeem are rate limited in a server-controlled store.

## Index baseline

Memberships by active user; lists by household, kind and status; tasks by
household, list, completed, sort order and id; partial incomplete-task indexes
for `(household_id, assignee_id, due_at, id)`. Receipt identity and token hashes
are uniquely indexed. Inspect `EXPLAIN (ANALYZE, BUFFERS)` on representative
synthetic data before adding overlapping indexes. Progress is never stored.

## Tests

- `supabase/tests/database/001_schema.sql` — tables, deadline and assignee
  nullability, RLS, direct-write denial, RPC presence.
- `supabase/tests/database/002_behavior.sql` — profile and household creation,
  one-household enforcement, input validation, idempotency mismatch, template
  copy and reset, list templates and notes, template deletion, invitations,
  claim, completion, progress, stale versions, member projection and
  cross-household denial.
- `supabase/tests/concurrency.mjs` — genuine parallel transactions proving
  duplicate creates produce one entity and receipt, competing claims produce
  one winner, and simultaneous appends receive distinct consecutive positions.
- `tooling/tests/database-static.test.mjs` — SQL boundary regressions that run
  without Docker, including that saving a list never writes a task template and
  that `delete_list` archives rather than drops.

The `Database` GitHub workflow replays committed migrations into a disposable
Supabase stack, runs `supabase db lint` with warnings failing the job, then
pgTAP and the parallel-transaction tests. Three contract races remain uncovered
— risk R3 in `known-risks.md`.

A pgTAP file that emits no plan fails the whole workflow with "No plan found in
TAP output", which is why scripts that assert by raising live in
`supabase/smoke/` and a tooling test enforces the split.

## Design notes worth keeping

Invitation generation was resolved inside Postgres rather than requiring an Edge
Function: `create_invitation(request_id)` returns the opaque token while the
database stores only its hash and a rederivable invitation ID. Clients still
receive one expiring link and can retry the same request safely.

Avatars are initials in the MVP, so Storage is unnecessary. If upload is ever
approved it needs a private bucket with household-scoped policies and signed
delivery — never a public bucket containing family information.
