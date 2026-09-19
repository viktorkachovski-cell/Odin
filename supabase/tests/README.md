# Database tests

## What has been executed

The sequential authorization, validation, idempotency and version behaviour in
`concurrency.sql`'s surrounding contract was exercised against the staging
project during implementation, as ordinary `authenticated` sessions (role set to
`authenticated`, `request.jwt.claims` set to a fixture user id). Verified:

- Household creation, seeding into 3 templates, and one-active-household enforcement
- Idempotent replay returning the original result; `IDEMPOTENCY_MISMATCH` on a
  changed payload under the same request ID
- Invitation create → redeem → `INVITE_USED`, with an idempotent retry rederiving
  the identical link
- `copy_template` resetting runtime fields, leaving the source untouched, and
  producing separate copies for separate request IDs
- Template tasks unreachable through active commands (`NOT_FOUND`)
- `expected_version` conflicts reporting `current_version`
- Claim races (sequentially): `ALREADY_ASSIGNED` for the loser
- Cross-household denial: `NOT_FOUND` from `get_list`, zero rows from a direct
  `select` on `public.tasks`, `FORBIDDEN` from `get_members`
- `set_task_completed` as an explicit desired state, with replay not
  double-incrementing the version
- Whole-list progress counts and My Tasks / Unassigned ordering

All fixture users and data created for that run were deleted afterwards.

## What has NOT been executed

**The two-backend concurrency cases in `concurrency.sql` have not been run.**

They need two real overlapping transactions. The implementation environment
reached the database through a pooled tool connection with no superuser and no
database password, so `dblink` could not open a second backend
(`password or GSSAPI delegated credentials required`) and no second session was
otherwise available. Running the statements sequentially in one session would
have proved nothing, so they were left unexecuted rather than reported as passing.

These remain a **release prerequisite**. Run them locally before promoting to
production:

```sh
supabase start                  # disposable local stack
psql "$LOCAL_DB_URL" -f supabase/schemas/01_tables.sql   # ...through 13_
./supabase/tests/run-concurrency.sh "$LOCAL_DB_URL"
```

The mechanisms they exercise are implemented and reviewed — row locks in
`private.load_task`, the advisory user lock in `private.lock_user`, the
`(actor_id, request_id)` unique index, the `memberships_single_active_household`
partial unique index, and the `unique_violation` handler that rolls a duplicate
back to its savepoint — but "implemented and reviewed" is not "tested", and this
file should not be read as claiming otherwise.

## Never run against a hosted project

These scripts create and delete fixture users. Point them only at a disposable
local database.
