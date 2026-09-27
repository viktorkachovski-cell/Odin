# Shared data and command contract

This file is the integration authority. Database agent implements it first; both clients consume the same generated types and runtime validation. Proposed field names are fixed for the handoff; amend here before changing callers. Do not infer permissions from a client-supplied household ID.

## Stored model

All IDs are UUIDs. All instants are Postgres `timestamptz`, serialized as ISO 8601 UTC. Server owns timestamps and versions. Record names below are SQL names; DTOs may preserve snake_case to avoid mapping mistakes.

| Table                      | Required fields and invariants                                                                                                                                                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`                 | `user_id` PK referencing Auth, `display_name`, nullable `avatar_ref`, `locale` en/bg, `created_at`, `updated_at`; shared users see only identity needed for their household, never email                                                              |
| `households`               | `id`, `name`, `seed_locale`, `created_by`, `created_at`; no task-management role hierarchy                                                                                                                                                            |
| `memberships`              | PK (`household_id`,`user_id`), `status` active/inactive, timestamps; partial unique active membership on `user_id` enforces one active household                                                                                                      |
| `lists`                    | `id`, `household_id`, `kind` template/active, `title`, nullable `subtitle`, nullable shared `notes` (max 5,000), `status` open/archived, nullable `seed_key`, `created_by`, `created_at`, `updated_at`, `version` positive bigint; NO deadline column |
| `tasks`                    | `id`, `household_id`, `list_id`, `title` (1–500), nullable shared `notes` (max 5,000), `sort_order`, `completed`, nullable `assignee_id`/`due_at`, timestamps, positive `version`                                                                     |
| `task_templates`           | `id`, `household_id`, `title`, nullable `notes`, `created_by`, `created_at`; one task only, no assignment, deadline or completion state                                                                                                               |
| `private.command_receipts` | actor, household, request ID, command name, canonical payload hash, successful result reference/response, creation time; unique (actor, request ID)                                                                                                   |
| `private.invitations`      | id, household, creator, unique token hash, expiration, nullable redeemed_by/redeemed_at/revoked_at; never expose raw tokens or hashes via table reads                                                                                                 |

Templates are two separate types and never mix: a **list template** is a `lists` row with `kind = 'template'` carrying its own tasks, and a **task template** is a `task_templates` row carrying one task. Saving one never writes the other, so a task template can be loaded on its own. A member-saved list template has a null `seed_key`; `unique (household_id, seed_key)` still keeps one seeded template per key per household. See `docs/features.md`.

Composite FK `(household_id,list_id)` references a unique `(household_id,id)` on lists. Composite assignee FK references memberships; a command/trigger additionally verifies active status. A template task must remain unassigned, incomplete and undated. Enforce in SQL, not just the client. Index child FKs. `sort_order` is an integer; append inside a locked list transaction to avoid duplicate positions; use ID as deterministic read tie-breaker.

Select projections must not leak `profiles.locale`, invite metadata or receipts to other members. Provide a security-invoker member identity projection or narrowly scoped read RPC containing only user_id, display_name, avatar_ref and active membership. Profile ownership changes use a scoped command; household selection comes from active membership.

## Read adapter API

`@odin/data` exposes `getSession`, `getMyHousehold`, `getMembers`, `getHome`, `getList`, `getUnassigned`, `getMyTasks`, `getTaskTemplates`, and command methods below. React query hooks can wrap these in the same package, but pure repositories remain testable without rendering. Clients supply platform storage and public Supabase configuration at bootstrap.

- `getHome`: list-template summaries and open active-list summaries with total/completed counts, each carrying `subtitle` and `notes`; avoid N+1 per-list reads. Task templates are never returned here; they come from `getTaskTemplates`.
- `getList(listId)`: list plus task pages ordered `(completed ASC, sort_order ASC, id ASC)` and total/completed counts for the full list. Progress must never be based only on a loaded page.
- `getUnassigned`: open active lists; incomplete tasks; null assignee.
- `getMyTasks`: open active lists; incomplete tasks; assignee = authenticated user; due ascending nulls last, stable list/task ID tie-breaker.
- Paginate lists/tasks at 50 rows with opaque keyset cursor; return `next_cursor`. Render all pages as fetched. Invalidate affected pages after writes; no silent backend-default truncation.
- Shared progress: `total === 0 ? 0 : Math.round(completed * 100 / total)`. Server aggregate and client use identical positive-half-up rounding. Test 0/0, 1/3, 2/3, 1/8, 1/1.

## Mutation envelope

Every command takes a UUID `request_id`; every edit takes `expected_version`. Derive actor from `auth.uid()`. Scope receipts to actor, command and payload; reject a request ID reused with different input. Persist successful receipt and mutation atomically. Repeating a committed request returns its original result without repeating work. Check current authorization before returning a receipt after revocation. Failed validation/conflict commands do not consume the ID. Do not automatically retry conflicts; a revised submission gets a new ID and fresh version.

Preserve successful receipt identity for MVP; do not purge receipts on an arbitrary short timer and thereby permit late duplicate creates. If response retention later changes, preserve a uniqueness tombstone and document the retry horizon. Reauthorize before revealing any stored result.

Responses are a discriminated union: `{ok:true,data:...}` or `{ok:false,error:{code,message_key,current_version?}}`. SQL RPC transport/auth errors are mapped by `@odin/data` to the same typed client error model. Do not show SQL text to users.

Codes: `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION`, `CONFLICT`, `ALREADY_ASSIGNED`, `IDEMPOTENCY_MISMATCH`, `INVITE_EXPIRED`, `INVITE_USED`, `INVITE_REVOKED`, `ALREADY_IN_HOUSEHOLD`, `RATE_LIMITED`, `TOO_LARGE`, `NETWORK`, `UNKNOWN`. `TOO_LARGE` is returned only by the snapshot reads below, when a collection exceeds what one read returns. Cross-household nonexistent/inaccessible IDs produce the same non-disclosing `NOT_FOUND` shape. Validation errors identify safe field names. `NETWORK` can mean an unknown commit outcome; retry with the same ID.

| Command              | Input beyond envelope                                  | Result and atomic behavior                                                                                                                                                   |
| -------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `create_household`   | name, seed_locale                                      | household ID; locks user membership, creates membership and versioned seeds together; no second active household                                                             |
| `update_profile`     | display_name, locale, nullable avatar_ref              | own safe profile; avatar uploads not implemented in MVP                                                                                                                      |
| `create_list`        | title, nullable subtitle                               | complete list DTO, version 1; active/open only                                                                                                                               |
| `update_list`        | list_id, expected_version, title, subtitle             | updated DTO; active/open only                                                                                                                                                |
| `delete_list`        | list_id, expected_version                              | `{list_id}`; archives an open list of either kind and retains its tasks for recovery; an archived list is not deletable again                                                |
| `create_list_v2`     | title, nullable subtitle/notes                         | complete list DTO, version 1; active/open only; legacy `create_list` remains compatible and stores no note                                                                   |
| `update_list_v2`     | list_id, expected_version, title, subtitle, notes      | updated DTO; active/open only; legacy `update_list` preserves an existing note                                                                                               |
| `save_list_template` | list_id                                                | `{list_id}` of a new `kind='template'` list copying title, subtitle, notes and every task's title/notes/order; runtime state reset; source unchanged, so no expected_version |
| `copy_template`      | template_id                                            | `{list_id}`; copy source snapshot including notes in one transaction, reset all task runtime fields; one result per request ID                                               |
| `create_task_v2`     | list_id, title, nullable notes/assignee_id/due_at      | new task DTO; active/open parent, append order; legacy `create_task` remains compatible                                                                                      |
| `update_task_v2`     | task_id, expected_version, title, notes, assignee, due | full editor fields, completion untouched; legacy `update_task` preserves existing notes                                                                                      |
| `save_task_template` | title, nullable notes                                  | household task-template DTO; one task only, no runtime state accepted; never creates a list template                                                                         |
| `delete_task`        | task_id, expected_version                              | `{task_id}`; permanently deletes the task from an active/open list after the version check                                                                                   |
| `set_task_completed` | task_id, expected_version, completed boolean           | updated DTO; explicit desired state, never toggle                                                                                                                            |
| `claim_task`         | task_id, expected_version                              | assigns caller only if currently incomplete and unassigned; concurrent loser gets `ALREADY_ASSIGNED` or `CONFLICT`                                                           |
| `create_invitation`  | none                                                   | invitation ID, expiration, raw link once; active membership required, rate limited                                                                                           |
| `redeem_invitation`  | opaque token                                           | household ID; authenticate first, atomically lock token and user membership; one redemption                                                                                  |
| `revoke_invitation`  | invitation_id                                          | creator-only under proposed default, idempotent                                                                                                                              |

For create-invitation retries, do not store raw tokens in plaintext receipts. Use a server-side encrypted short-lived response for the original operation, or deterministically rederive the token with a server-only secret and recorded nonce. The chosen implementation must return the same usable link for a retry, keep token hashes as lookup keys, and have a tested key-rotation policy. This is a backend concern; no client token generation from predictable IDs.

Authentication uses supported Supabase Auth APIs, never custom password/OTP storage. Web and current Android builds use email/password; legacy mobile OTP helpers remain exported for older installed versions. Invite links carry no email or household name. Reject open redirects. Prefer a URL fragment token for web redemption so tokens are not sent in hosting request paths; strip it from visible history after capture and redact logs. Configure Android app links/deep links and web fallback explicitly.

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

Compatibility: no SQL migration, DTO change, error-code enum change, or identity replacement. Web and the current Android client consume the password APIs. Retain `requestSignInCode`/`verifySignInCode` exports and legacy translations for older installed mobile versions; new Android builds use email/password and the allowlisted web confirmation/recovery routes. The current default email template sends a link, so neither client depends on a code-entry email.

## Concurrency and revocation

All task mutations use conditional version checks; no last-write-wins full-row overwrite. Any changed task increments its own version once. List text changes increment list version; task mutations do not invalidate unrelated list-editor versions. Claims check eligibility in the transaction. Assignment must serialize with membership revocation so an inactive member cannot become an assignee after validation.

Lock order: caller/target membership rows sorted by user ID, then parent list, then tasks sorted by ID. The one exception is `move_task`, which locks its own task before the adjacent one; only moves lock two tasks, and they take the parent list lock first, so no cycle can form. `move_list` takes the household list-ordering lock before either list row. Invite redemption locks the user membership serialization key before invitation row. Explain exceptions and retry bounded serialization failures with the same request ID. Test genuine simultaneous transactions, not sequential calls labeled concurrency.

If a future approved operation deactivates membership, its transaction clears that member's task assignments and advances affected task versions, while denying further access. Do not implement a client removal button until authority/recovery rules are approved. Tests may use an internal fixture command to simulate revocation.

## Synchronization contract

Subscribe to RLS-protected list/task/membership changes for the active household, and identity updates where authorized. Treat payloads as invalidation hints. Refetch Home, current detail, My Tasks and Unassigned as affected; apply response immediately in initiating client. A stale fetch cannot overwrite a newer mutation result; cancel/reconcile query requests and compare versions. On subscription establishment/reconnect, window focus, Android foreground or expired-session recovery, refetch authoritative membership then data.

Revocation must clear client household state upon denied membership/read and stop subscriptions. If a deletion/revocation event is missed, periodic membership reconciliation while active provides bounded UI staleness; it is not an authorization boundary. Server authorization is immediate. Provide a 3-second foreground fallback refetch while realtime is unhealthy, with backoff during actual network failure. Verify the normal connected update budget of 5 seconds; do not promise background delivery.

## Task workflow amendment — 2026-09-27 (feature branch)

Owner-confirmed choices: unassigned follows assignment automatically, ordering
is shared by the household, the All Tasks filters use task deadlines, the
stored task lifecycle is Open/Blocked/Done, and each household collection is
read in one request.

- `tasks.blocked` is a non-null boolean defaulting to false, exclusive with
  `completed`. The stored state is `open`, `blocked` or `done`; the shared
  `taskStatus` projection shows Done, Blocked, or -- for an open task --
  Unassigned without an assignee and To-do with one. Assignment and text edits
  preserve blocked. Completing or reopening with the legacy completion command
  clears blocked. Templates cannot be blocked, and copying resets blocked along
  with every other runtime field.
- `set_task_state(request_id, task_id, expected_version, state)` accepts
  `open`, `blocked` or `done` and sets `completed`/`blocked` to match; `open`
  clears both. It never changes or validates against the assignee, so there is
  no assignment-dependent input. It returns the updated task DTO with one
  version increment.
- `lists.sort_order` provides order within each household and list kind.
  `move_list(request_id, list_id, expected_version, direction)` and
  `move_task(request_id, task_id, expected_version, direction)` accept up/down,
  swap adjacent rows atomically, and return `{list_id}` / `{task_id}`. Lists move
  within their open kind; tasks move within their incomplete/completed group
  in one open parent, including a template's tasks. A move at a boundary is an
  idempotent no-op. Both swapped rows advance their versions once. New lists
  append, including lists created by older clients.
- Every command that changes a task's position or completion group -- create,
  delete, complete, set state, move -- locks the open parent list before it
  touches task rows, then checks the expected version under the row lock. A
  move therefore always sees committed neighbours; a concurrent delete of the
  neighbour settles as a move past it or a boundary no-op.
- Current clients read each household collection as one snapshot:
  `get_home_v2()`, `get_list_v2(p_list_id)`, `get_my_tasks_v2()`,
  `get_unassigned_v2()` and `get_all_tasks(p_due_from, p_due_before,
p_undated, p_incomplete_only)`. Home returns `{items}` with templates first,
  then active lists, each by `sort_order` then id. List detail returns
  `{list, total_tasks, completed_tasks, progress_percent, tasks}`, incomplete
  first. The three task collections return `{items: [TaskDto plus
list_title]}` from open active lists, deadline ascending with undated last,
  then list and task ID; My Tasks and Unassigned are incomplete only. A
  collection above 1,000 rows returns `TOO_LARGE` instead of a truncated
  result. There is no cursor: pages read at different moments could drop or
  repeat a row another member reorders in between.
- `get_all_tasks` date bounds default null and booleans default false. The
  lower bound is inclusive, the upper exclusive, and bounds apply only to
  dated tasks; `p_undated` selects exactly the undated tasks and cannot be
  combined with bounds. Invalid combinations return `VALIDATION`.
- `getTask(client, taskId)` reads one full task through RLS and an inner join
  requiring an open parent. Missing, archived and inaccessible tasks all
  produce NOT_FOUND. No additional privilege is granted. Full notes remain
  shared household content. Task/detail/all-tasks queries join the existing
  mutation and Realtime invalidation sets.

Compatibility: every RPC an installed client calls keeps its signature --
`get_home`, `get_list`, `get_my_tasks`, `get_unassigned` (still paged) and
`set_task_completed` among them -- and `completed` keeps its meaning. Within
this unmerged branch, migration `20260927154349_task_workflow_review_fixes`
replaces the branch's own first-draft RPCs: `set_task_status` becomes
`set_task_state`, and the paged `get_home_v2(p_cursor, p_limit)` and
`get_all_tasks(..., p_cursor, p_limit)` become snapshot reads. Neither draft
was deployed, so no installed client calls them. `TOO_LARGE` is a new error
code that only the new reads return; both updated clients localise it. Legacy
payloads without blocked/sort_order parse as false/zero. **Apply both branch
migrations before testing these branch clients against a database.** Older
installed clients keep their previous ordering UI and can continue editing and
completing tasks. This amendment documents branch behaviour, not a production
deployment.
