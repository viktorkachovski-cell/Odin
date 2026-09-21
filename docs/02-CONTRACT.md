# Shared data and command contract

This file is the integration authority. Database agent implements it first; both clients consume the same generated types and runtime validation. Proposed field names are fixed for the handoff; amend here before changing callers. Do not infer permissions from a client-supplied household ID.

## Stored model

All IDs are UUIDs. All instants are Postgres `timestamptz`, serialized as ISO 8601 UTC. Server owns timestamps and versions. Record names below are SQL names; DTOs may preserve snake_case to avoid mapping mistakes.

| Table                      | Required fields and invariants                                                                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`                 | `user_id` PK referencing Auth, `display_name`, nullable `avatar_ref`, `locale` en/bg, `created_at`, `updated_at`; shared users see only identity needed for their household, never email                         |
| `households`               | `id`, `name`, `seed_locale`, `created_by`, `created_at`; no task-management role hierarchy                                                                                                                       |
| `memberships`              | PK (`household_id`,`user_id`), `status` active/inactive, timestamps; partial unique active membership on `user_id` enforces one active household                                                                 |
| `lists`                    | `id`, `household_id`, `kind` template/active, `title`, nullable `subtitle`, `status` open/archived, nullable `seed_key`, `created_by`, `created_at`, `updated_at`, `version` positive bigint; NO deadline column |
| `tasks`                    | `id`, `household_id`, `list_id`, `title`, `sort_order`, `completed` boolean default false, nullable `assignee_id`, nullable `due_at`, server timestamps, positive `version`                                      |
| `private.command_receipts` | actor, household, request ID, command name, canonical payload hash, successful result reference/response, creation time; unique (actor, request ID)                                                              |
| `private.invitations`      | id, household, creator, unique token hash, expiration, nullable redeemed_by/redeemed_at/revoked_at; never expose raw tokens or hashes via table reads                                                            |

Composite FK `(household_id,list_id)` references a unique `(household_id,id)` on lists. Composite assignee FK references memberships; a command/trigger additionally verifies active status. A template task must remain unassigned, incomplete and undated. Enforce in SQL, not just the client. Index child FKs. `sort_order` is an integer; append inside a locked list transaction to avoid duplicate positions; use ID as deterministic read tie-breaker.

Select projections must not leak `profiles.locale`, invite metadata or receipts to other members. Provide a security-invoker member identity projection or narrowly scoped read RPC containing only user_id, display_name, avatar_ref and active membership. Profile ownership changes use a scoped command; household selection comes from active membership.

## Read adapter API

`@odin/data` exposes `getSession`, `getMyHousehold`, `getMembers`, `getHome`, `getList`, `getUnassigned`, `getMyTasks`, and command methods below. React query hooks can wrap these in the same package, but pure repositories remain testable without rendering. Clients supply platform storage and public Supabase configuration at bootstrap.

- `getHome`: template summaries and open active-list summaries with total/completed counts; avoid N+1 per-list reads.
- `getList(listId)`: list plus task pages ordered `(completed ASC, sort_order ASC, id ASC)` and total/completed counts for the full list. Progress must never be based only on a loaded page.
- `getUnassigned`: open active lists; incomplete tasks; null assignee.
- `getMyTasks`: open active lists; incomplete tasks; assignee = authenticated user; due ascending nulls last, stable list/task ID tie-breaker.
- Paginate lists/tasks at 50 rows with opaque keyset cursor; return `next_cursor`. Render all pages as fetched. Invalidate affected pages after writes; no silent backend-default truncation.
- Shared progress: `total === 0 ? 0 : Math.round(completed * 100 / total)`. Server aggregate and client use identical positive-half-up rounding. Test 0/0, 1/3, 2/3, 1/8, 1/1.

## Mutation envelope

Every command takes a UUID `request_id`; every edit takes `expected_version`. Derive actor from `auth.uid()`. Scope receipts to actor, command and payload; reject a request ID reused with different input. Persist successful receipt and mutation atomically. Repeating a committed request returns its original result without repeating work. Check current authorization before returning a receipt after revocation. Failed validation/conflict commands do not consume the ID. Do not automatically retry conflicts; a revised submission gets a new ID and fresh version.

Preserve successful receipt identity for MVP; do not purge receipts on an arbitrary short timer and thereby permit late duplicate creates. If response retention later changes, preserve a uniqueness tombstone and document the retry horizon. Reauthorize before revealing any stored result.

Responses are a discriminated union: `{ok:true,data:...}` or `{ok:false,error:{code,message_key,current_version?}}`. SQL RPC transport/auth errors are mapped by `@odin/data` to the same typed client error model. Do not show SQL text to users.

Codes: `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION`, `CONFLICT`, `ALREADY_ASSIGNED`, `IDEMPOTENCY_MISMATCH`, `INVITE_EXPIRED`, `INVITE_USED`, `INVITE_REVOKED`, `ALREADY_IN_HOUSEHOLD`, `RATE_LIMITED`, `NETWORK`, `UNKNOWN`. Cross-household nonexistent/inaccessible IDs produce the same non-disclosing `NOT_FOUND` shape. Validation errors identify safe field names. `NETWORK` can mean an unknown commit outcome; retry with the same ID.

| Command              | Input beyond envelope                                 | Result and atomic behavior                                                                                                       |
| -------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `create_household`   | name, seed_locale                                     | household ID; locks user membership, creates membership and versioned seeds together; no second active household                 |
| `update_profile`     | display_name, locale, nullable avatar_ref             | own safe profile; avatar uploads not implemented in MVP                                                                          |
| `create_list`        | title, nullable subtitle                              | complete list DTO, version 1; active/open only                                                                                   |
| `update_list`        | list_id, expected_version, title, subtitle            | updated DTO; active/open only                                                                                                    |
| `delete_list`        | list_id, expected_version                             | `{list_id}`; archives the active list and retains its tasks for recovery; templates and already archived lists are not deletable |
| `copy_template`      | template_id                                           | `{list_id}`; copy source snapshot in one transaction, reset all task runtime fields; one result per request ID                   |
| `create_task`        | list_id, title, nullable assignee_id, nullable due_at | new task DTO; active/open parent, append order under list lock                                                                   |
| `update_task`        | task_id, expected_version, title, assignee_id, due_at | full editor fields, updated task DTO; completed state untouched                                                                  |
| `delete_task`        | task_id, expected_version                             | `{task_id}`; permanently deletes the task from an active/open list after the version check                                       |
| `set_task_completed` | task_id, expected_version, completed boolean          | updated DTO; explicit desired state, never toggle                                                                                |
| `claim_task`         | task_id, expected_version                             | assigns caller only if currently incomplete and unassigned; concurrent loser gets `ALREADY_ASSIGNED` or `CONFLICT`               |
| `create_invitation`  | none                                                  | invitation ID, expiration, raw link once; active membership required, rate limited                                               |
| `redeem_invitation`  | opaque token                                          | household ID; authenticate first, atomically lock token and user membership; one redemption                                      |
| `revoke_invitation`  | invitation_id                                         | creator-only under proposed default, idempotent                                                                                  |

For create-invitation retries, do not store raw tokens in plaintext receipts. Use a server-side encrypted short-lived response for the original operation, or deterministically rederive the token with a server-only secret and recorded nonce. The chosen implementation must return the same usable link for a retry, keep token hashes as lookup keys, and have a tested key-rotation policy. This is a backend concern; no client token generation from predictable IDs.

Authentication uses supported Supabase Auth APIs, never custom password/OTP storage. Web now uses email/password; legacy mobile OTP helpers remain exported during migration. Invite links carry no email or household name. Reject open redirects. Prefer a URL fragment token for web redemption so tokens are not sent in hosting request paths; strip it from visible history after capture and redact logs. Configure Android app links/deep links and web fallback explicitly.

### Additive authentication contract — 2026-09-21

All functions below are exported by `@odin/data`, accept the existing `OdinSupabaseClient`, and return `CommandResult<T>`. They do not use database command receipts or request IDs. Never put credentials or auth tokens in command receipts. Supabase owns password hashing, identity, confirmation, recovery, session issuance and rate limits.

| Function               | Arguments after client            | Success data                        |
| ---------------------- | --------------------------------- | ----------------------------------- |
| `registerWithPassword` | email, password, emailRedirectTo  | `{ confirmationRequired: boolean }` |
| `signInWithPassword`   | email, password                   | `AuthUser`                          |
| `resendConfirmation`   | email, emailRedirectTo            | `null`                              |
| `requestPasswordReset` | email, redirectTo                 | `null`                              |
| `updatePassword`       | password                          | `null`                              |
| `restoreEmailSession`  | `{ access_token, refresh_token }` | `AuthUser`                          |

Email is trimmed; password is passed unchanged. `validateNewPassword(password, confirmation)` and `PASSWORD_MIN_LENGTH` live in `@odin/domain`; validation applies only to registration and password updates. Provider errors map to safe `auth.password.*` translation keys or existing command errors. Duplicate registrations and reset acknowledgements must not reveal account existence. Destinations are application-owned constants or the current trusted web origin plus fixed paths, never user-supplied URLs.

Compatibility: no SQL migration, DTO change, error-code enum change, or identity replacement. Web consumes the new API now. Mobile continues compiling with `requestSignInCode`/`verifySignInCode`; its migration must follow `16-MOBILE-PASSWORD-AUTH-AGENT.md`. Retain OTP exports and translations until every supported mobile version has migrated. The current default email template sends a link, so the old mobile code-entry screen still needs the planned migration before general release.

## Concurrency and revocation

All task mutations use conditional version checks; no last-write-wins full-row overwrite. Any changed task increments its own version once. List text changes increment list version; task mutations do not invalidate unrelated list-editor versions. Claims check eligibility in the transaction. Assignment must serialize with membership revocation so an inactive member cannot become an assignee after validation.

Lock order: caller/target membership rows sorted by user ID, then parent list, then tasks sorted by ID. Invite redemption locks the user membership serialization key before invitation row. Explain exceptions and retry bounded serialization failures with the same request ID. Test genuine simultaneous transactions, not sequential calls labeled concurrency.

If a future approved operation deactivates membership, its transaction clears that member's task assignments and advances affected task versions, while denying further access. Do not implement a client removal button until authority/recovery rules are approved. Tests may use an internal fixture command to simulate revocation.

## Synchronization contract

Subscribe to RLS-protected list/task/membership changes for the active household, and identity updates where authorized. Treat payloads as invalidation hints. Refetch Home, current detail, My Tasks and Unassigned as affected; apply response immediately in initiating client. A stale fetch cannot overwrite a newer mutation result; cancel/reconcile query requests and compare versions. On subscription establishment/reconnect, window focus, Android foreground or expired-session recovery, refetch authoritative membership then data.

Revocation must clear client household state upon denied membership/read and stop subscriptions. If a deletion/revocation event is missed, periodic membership reconciliation while active provides bounded UI staleness; it is not an authorization boundary. Server authorization is immediate. Provide a 3-second foreground fallback refetch while realtime is unhealthy, with backoff during actual network failure. Verify the normal connected update budget of 5 seconds; do not promise background delivery.
