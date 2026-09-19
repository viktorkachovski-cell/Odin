# Odin database

Implements `docs/02-CONTRACT.md`. Declarative schema lives in `supabase/schemas/`
and is applied in filename order; each file was applied to the staging project as
a migration of the same name.

## Security model

- Clients hold **SELECT only** on five tables. There is no INSERT/UPDATE/DELETE
  policy anywhere, so every write must go through a command RPC and cannot skip
  the receipt and version checks.
- RLS is enabled **and forced** on all five exposed tables.
- The `private` schema is not in PostgREST's exposed schemas, has **zero** table
  grants to `anon`/`authenticated`, and `anon` has no `USAGE` on it at all.
  `authenticated` has `USAGE` only because the SECURITY INVOKER command wrappers
  resolve their private helpers as the caller.
- Cross-household and nonexistent IDs return the same non-disclosing `NOT_FOUND`.

### Why `private.*` tables have RLS disabled

Supabase's linter flags any table without RLS. For `private.*` the warning's
premise does not hold: those tables are unreachable, because the schema is not
exposed through PostgREST and carries no grants. Verified on the staging project:

| Check                                                                             | Result  |
| --------------------------------------------------------------------------------- | ------- |
| `has_schema_privilege('anon','private','usage')`                                  | `false` |
| Table grants in `private` to anon/authenticated/PUBLIC                            | `0`     |
| `has_table_privilege('authenticated','private.server_secrets','select')`          | `false` |
| `has_table_privilege('authenticated','private.invitations','select')`             | `false` |
| `has_function_privilege('authenticated','private.derive_token(bytea)','execute')` | `false` |

Enabling RLS there would add nothing, because SECURITY DEFINER helpers run as the
owner and would bypass it anyway. Re-verify these five rows after any grant change.

## Function matrix

Owner is the schema owner (`postgres`) throughout. "Callable by" lists roles with
an explicit `EXECUTE` grant; `EXECUTE` is revoked from `PUBLIC` on every function.

| Function                                                            | Mode    | Callable by     | Authorization performed                                                    |
| ------------------------------------------------------------------- | ------- | --------------- | -------------------------------------------------------------------------- |
| `public.create_household`                                           | INVOKER | `authenticated` | delegates; wrapper only converts the OD001 error signal                    |
| `public.update_profile`                                             | INVOKER | `authenticated` | delegates                                                                  |
| `public.create_list`                                                | INVOKER | `authenticated` | delegates                                                                  |
| `public.update_list`                                                | INVOKER | `authenticated` | delegates                                                                  |
| `public.copy_template`                                              | INVOKER | `authenticated` | delegates                                                                  |
| `public.create_task`                                                | INVOKER | `authenticated` | delegates                                                                  |
| `public.update_task`                                                | INVOKER | `authenticated` | delegates                                                                  |
| `public.set_task_completed`                                         | INVOKER | `authenticated` | delegates                                                                  |
| `public.claim_task`                                                 | INVOKER | `authenticated` | delegates                                                                  |
| `public.create_invitation`                                          | INVOKER | `authenticated` | delegates                                                                  |
| `public.redeem_invitation`                                          | INVOKER | `authenticated` | delegates                                                                  |
| `public.revoke_invitation`                                          | INVOKER | `authenticated` | delegates                                                                  |
| `public.get_home`                                                   | INVOKER | `authenticated` | RLS on `lists`/`tasks`                                                     |
| `public.get_list`                                                   | INVOKER | `authenticated` | RLS; a foreign list is indistinguishable from a missing one                |
| `public.get_my_tasks`                                               | INVOKER | `authenticated` | RLS plus `assignee_id = auth.uid()`                                        |
| `public.get_unassigned`                                             | INVOKER | `authenticated` | RLS plus `assignee_id is null`                                             |
| `public.get_members`                                                | DEFINER | `authenticated` | `require_actor` + `require_active_household`; returns identity fields only |
| `public.get_my_household`                                           | DEFINER | `authenticated` | `require_actor`; scoped to the caller's own rows                           |
| `private.cmd_*` (12)                                                | DEFINER | `authenticated` | each re-derives the actor from `auth.uid()` and re-checks membership       |
| `private.is_active_member`                                          | DEFINER | `authenticated` | pinned to `auth.uid()`; answers only about the caller                      |
| `private.active_household_id`                                       | DEFINER | `authenticated` | pinned to `auth.uid()`                                                     |
| `private.require_active_household`                                  | DEFINER | (none)          | reached only from DEFINER helpers                                          |
| `private.seed_household`                                            | DEFINER | (none)          | reached only from `cmd_create_household`                                   |
| `private.derive_token`                                              | DEFINER | (none)          | reads the server secret; never client-callable                             |
| `private.load_list` / `load_task` / `require_assignable`            | DEFINER | (none)          | row locks and same-household checks                                        |
| `private.replay` / `record_receipt` / `check_rate` / `consume_rate` | DEFINER | (none)          | idempotency and rate limiting                                              |

Every DEFINER function sets `search_path = ''` and fully qualifies its objects.

### Reviewed advisor exception

`get_members` and `get_my_household` are DEFINER and callable by signed-in users,
which the Supabase linter reports as
`authenticated_security_definer_function_executable`. This is deliberate and
required by the contract's "narrowly scoped read RPC" for member identity: RLS on
`profiles` restricts a member to their own row, so the household member list
cannot come from a plain SELECT. Both functions authenticate, scope strictly to
the caller's own active household, and return only `user_id`, `display_name` and
`avatar_ref` — never an email, and never another member's `locale`.

## Idempotency and concurrency

- Every command takes a `request_id`; `private.command_receipts` is unique on
  `(actor_id, request_id)`.
- A replay with the same payload returns the original result; a different payload
  under the same ID returns `IDEMPOTENCY_MISMATCH`.
- The receipt insert races with a concurrent identical request: the loser catches
  `unique_violation` on `command_receipts_actor_request_unique`, rolls its own
  work back to the sub-block savepoint, and returns the winner's result.
- Errors raise `SQLSTATE 'OD001'` so the transaction rolls back — a failed
  command leaves no receipt and does not consume the request ID.
- Lock order: user serialization key (advisory, by user id) → parent list →
  task/membership rows.
- Redemption failures deliberately **return** an error rather than raising, so the
  failed-attempt rate counter commits. Nothing is written before those checks.

## Invitation tokens

Raw tokens are never stored. Each invitation holds a 256-bit `nonce`; the token is
`HMAC-SHA256(nonce, server_secret)`, URL-safe base64, and `token_hash` is its
SHA-256. An idempotent retry rederives the identical link from the stored nonce,
so the receipt never contains a usable secret.

**Key rotation policy:** rotating `private.server_secrets.invitation_token`
invalidates every outstanding invitation, bounded by the 72-hour TTL. Rotate by
updating that row; no re-issue of live links is possible or intended. Redemption
keeps working because lookup is by `token_hash`, which is unchanged for links
already issued — but those links can no longer be _rederived_ for a retry, so
rotate only when no create is in flight.

## Configurable policy

`private.settings` holds values that are policy, not code:

| Key                                 | Default | Meaning                        |
| ----------------------------------- | ------- | ------------------------------ |
| `invitation_ttl_hours`              | 72      | Invitation lifetime            |
| `invite_create_limit`               | 10      | Creates per member per window  |
| `invite_create_window_minutes`      | 60      | Create window                  |
| `invite_redeem_fail_limit`          | 10      | Failed redemptions per account |
| `invite_redeem_fail_window_minutes` | 15      | Failed-redemption window       |

These are the proposed defaults in `docs/01-DECISIONS.md` and remain **release
blockers until approved**, not silently adopted product policy.

## Seed content

`private.seed_lists` / `private.seed_tasks` hold reviewed English and Bulgarian
template content at version `v1`. `lists.seed_key` (e.g. `v1:weekly-cleaning`) is
unique per household, so a retried create cannot seed duplicates. Published seed
text is never edited in place: a change ships as `v2:` keys so existing households
keep what they were created with.

## Known limitations

- **Home ordering does not preserve curated seed order.** Seeded templates all
  share one `created_at` (a single transaction), so `(created_at, id)` falls back
  to the random UUID. Ordering is deterministic and stable, but "Weekly cleaning"
  is not guaranteed to appear first. Fixing it properly needs an explicit sort
  column on `lists`; recorded for UI review rather than patched with faked
  timestamps.
- **Member deactivation is not implemented**, because member removal is an
  unapproved lifecycle decision. The schema supports it (`memberships.status`),
  and `tasks_assignee_same_household` has no `ON DELETE`, so a member row cannot
  be deleted while they hold assignments — deactivation must clear assignments
  and bump the affected task versions, per the contract.
- **Concurrency tests in `tests/` have not been executed** against this project.
  See `supabase/tests/README.md`.
