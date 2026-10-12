# Test guide

Every automated test in Odin, grouped by what it protects rather than by file.
It is written for someone new to the codebase. Each entry says in plain words
what the test does, and the 💭 line underneath is a reviewer's opinion: why the
test matters, or where it checks less than its name suggests.

Snapshot of commit `ff31606` on 2026-10-12. A test added after that is not
listed here; `verification.md` holds the current counts. An `it.each` with
several rows counts as several tests in the runner but appears once below, with
its case count.

## Contents

1. [Before you start](#1-before-you-start)
2. [The shared data contract](#2-the-shared-data-contract)
3. [Business rules](#3-business-rules)
4. [Translations](#4-translations)
5. [Talking to the server](#5-talking-to-the-server)
6. [Sign-in, registration and password recovery](#6-sign-in-registration-and-password-recovery)
7. [Sessions, identity and safe navigation](#7-sessions-identity-and-safe-navigation)
8. [Invitations and email links](#8-invitations-and-email-links)
9. [Lists, task rows and menus](#9-lists-task-rows-and-menus)
10. [Task details and editing](#10-task-details-and-editing)
11. [Command plumbing](#11-command-plumbing)
12. [Today and Tasks screens](#12-today-and-tasks-screens)
13. [Navigation on Android](#13-navigation-on-android)
14. [Live sync](#14-live-sync)
15. [Notifications](#15-notifications)
16. [The database](#16-the-database)
17. [Guardrails on the code itself](#17-guardrails-on-the-code-itself)
18. [Cross-cutting observations](#18-cross-cutting-observations)

## 1. Before you start

### The six kinds of test

| Kind                     | Runner                                 | Lives in                                 | Command                                          | Real database?                |
| ------------------------ | -------------------------------------- | ---------------------------------------- | ------------------------------------------------ | ----------------------------- |
| Shared logic and adapter | Vitest on Node                         | `packages/*/src/*.test.ts`               | `npm run test`                                   | No                            |
| Web components           | Vitest, jsdom, Testing Library         | `apps/web/src/**/*.test.ts(x)`           | `npm run test`                                   | No                            |
| Android                  | Jest (`jest-expo`), RN Testing Library | `apps/mobile/src/**/*.test.ts(x)`        | `npm run test:mobile`                            | No                            |
| Tooling tripwires        | `node:test`                            | `tooling/tests/`, `apps/mobile/scripts/` | `npm run test:tooling`, `npm run test:mobile`    | No — reads SQL as text        |
| Database                 | pgTAP; a Node script for races         | `supabase/tests/`                        | `npm run db:test`, `npm run db:test:concurrency` | Yes — disposable local stack  |
| Smoke scripts            | `psql`, by hand                        | `supabase/smoke/`                        | see `supabase/smoke/README.md`                   | Yes — production, rolled back |

The one idea to hold on to: only the last two rows touch Postgres. Everything
above them replaces the server with a fake. So when a web test says "a conflict
is handled", it means "the screen behaves correctly _if_ the server answers
`CONFLICT`". Whether the server really answers `CONFLICT` is proven in pgTAP.
You need both halves before you can say a feature works.

### Words you will meet

- **RPC** — a Postgres function the client calls, such as `create_task` or
  `claim_task`. Clients never write tables directly; every write is an RPC.
- **RLS (row-level security)** — Postgres rules that hide rows belonging to
  other households.
- **Request ID and idempotency** — every write carries a UUID. Sending the same
  ID twice does the work once and returns the first answer, which is what makes
  "retry after a network blip" safe.
- **Expected version and `CONFLICT`** — every edit says which version of the row
  it was looking at. If someone changed the row since, the server refuses
  rather than overwriting their change.
- **Snapshot read and `TOO_LARGE`** — lists and task collections come back in
  one piece. Above 1,000 rows the server refuses with `TOO_LARGE` instead of
  quietly cutting the list short.
- **Realtime hint** — a "something changed" ping from Supabase. The client
  refetches; it never trusts what the ping says.
- **Mock or double** — a fake stand-in for something real: the Supabase client,
  the Android keystore, the notification service. The Android doubles live in
  `apps/mobile/jest.setup.ts`.
- **pgTAP** — a test framework that runs inside Postgres. Each
  `select is(...)` is one assertion.

### Results when this was written

Run on 2026-10-12 in a Linux container with Node 22.22.0, after
`npm ci --ignore-scripts`:

| Command                              | Result                                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `npm run test:tooling`               | 12 passed                                                                                       |
| `npm run test`                       | 28 files, 244 passed                                                                            |
| `npm run test:mobile`                | 18 Jest suites, 138 passed; then 4 build-environment tests passed                               |
| `TZ=Asia/Tokyo npm run test`         | 243 passed, 1 failed — see [§18.1](#181-time-zones-are-not-pinned)                              |
| `npm run db:test`, concurrency suite | Not run here (needs the Docker stack); the Database workflow runs both when `supabase/` changes |

## 2. The shared data contract

### 2.1 Parsing server responses — `packages/contracts/src/parse.test.ts`

TypeScript types disappear at runtime, so the app checks the shape of every
server answer before using it. A surprise from the server becomes a clear
`ShapeError` instead of `undefined` leaking into the UI.

`parseTask`

- **"accepts a well-formed task and preserves nulls"** — a normal task parses;
  a `null` assignee and deadline stay `null`, and the version is kept.
  - 💭 The baseline. Every other parser test is "this, but broken in one way".
- **"treats a missing nullable field as null rather than undefined"** — with
  `assignee_id` removed entirely, the parser fills in `null`.
  - 💭 A compatibility test: an older RPC may omit a field. `null` and
    `undefined` behave differently in comparisons, so normalising here saves
    bugs further down.
- **"rejects a wrong primitive type instead of coercing it"** — `version: '1'`
  and `completed: 'false'` both throw.
  - 💭 Good. The string `'false'` is truthy in JavaScript, so coercing it would
    mark the task complete. Failing loudly is right.
- **"names the offending field so a shape bug is diagnosable"** — the error
  message contains `sort_order`.
  - 💭 A test for the next developer's sake. Cheap and kind.

Delete result parsers

- **"parses task IDs returned by delete_task"** — `{ task_id }` becomes the ID.
- **"rejects a delete result without a task ID"** — `{ list_id }` throws.
  - 💭 Guards against mixing up the `delete_list` and `delete_task` answers,
    which look alike.

`parseHome`

- **"parses the home snapshot carrying both list kinds"** — a template and an
  active list, with their counts.
- **"rejects an unexpected list kind"** — `kind: 'archived-thing'` throws.
  - 💭 A closed set of kinds means a new kind on the server has to be a
    deliberate client change, not something the UI renders by accident.

List notes

- **"reads the shared list note"**
- **"reads a database that predates the list note as having none"** — no
  `notes` key reads as `null`.
- **"carries the note onto Home cards and tolerates its absence"**
  - 💭 These three are the backwards-compatibility story for list notes: a new
    client must still read an old payload.

`parseListDetail`

- **"keeps whole-list totals"** — totals and progress come from the server's
  whole-list counts, and a task without `blocked` reads as `false`.
  - 💭 Two rules in one test, and the second hides in the last line: progress
    counts every task, not just the ones on screen, and older payloads without
    `blocked` are tolerated.

`parseTaskCollection`

- **"parses full task rows with their list title"**
- **"requires the parent list title"** — a row without `list_title` throws.
  - 💭 Note the asymmetry: `blocked` may be missing, `list_title` may not.
    Cross-list views cannot show a task without the name of its list.

`parseMembers`

- **"parses the identity projection"**
- **"accepts an empty household member list"**
  - 💭 Fine. The privacy rule — members never see each other's email or locale
    — is enforced in SQL; the parser only accepts the three safe fields.

Error helpers (`errors.ts`)

- **"recognises only codes the contract defines"**
- **"derives a default message key from the code"** — `ALREADY_ASSIGNED` gives
  `error.already_assigned`.
- **"omits current_version when there is none"**
- **"marks only NETWORK as safe to retry under the same request id"**
  - 💭 The most important line in the file. `NETWORK` means "I don't know
    whether the server did it", so you retry with the same ID and let
    idempotency remove the duplicate. Every other error is a definite answer;
    retrying the same ID would only replay it.

## 3. Business rules

`packages/domain` holds the rules both clients share, once, with no React or
Supabase in sight. These are the easiest tests to read and the best place to
start.

### 3.1 Progress — `domain.test.ts` › `progressPercent`

- **"%i of %i is %i percent"** (5 cases: 0/0 → 0, 1/3 → 33, 2/3 → 67,
  1/8 → 13, 1/1 → 100)
  - 💭 Copied straight from the examples in `contract.md`. When a spec lists
    examples, paste them into an `it.each` like this.
- **"rounds exact halves up"** — 1/8 (12.5) → 13 and 3/8 (37.5) → 38.
  - 💭 Must match the SQL rounding, or web, Android and server would disagree
    by one percent. The 1/8 case repeats the row above; 3/8 is the new
    information.
- **"treats an empty list as zero rather than dividing by zero"**
  - 💭 Also checks for `NaN`, which is what 0/0 gives in JavaScript and would
    render as "NaN%".
- **"never exceeds 100 even if counts disagree transiently"** — 5 of 3 is 100.
  - 💭 Defensive: two reads in flight can briefly disagree.
- **"rejects negative and non-finite counts"** — throws `RangeError`.
- **"reports completeness only for non-empty lists"** — 0/0 is not complete,
  3/3 is.
  - 💭 An empty list with a "done" tick would look odd; good that it is pinned.

### 3.2 Sorting — `domain.test.ts`

- **"puts incomplete before complete, then sort_order, then id"**
- **"breaks ties on id so repeated sorts are stable"**
  - 💭 Mirrors the SQL `order by completed, sort_order, id`. Client and server
    must sort identically or rows jump when a refetch lands.
- **"orders by due date with undated last"**
- **"uses list id then task id for undated ties"**
  - 💭 The same idea for cross-list views. The fixture uses only
    `{ id, list_id, due_at }`, which shows the sorter needs nothing more.

### 3.3 Text limits — `domain.test.ts` › validation

- **"counts Unicode code points, not UTF-16 units"** — `'ключ'` is 4 and `'👍'`
  is 1, while JavaScript's `.length` says 2 for the emoji.
  - 💭 A great teaching test. Postgres counts code points; JavaScript counts
    UTF-16 units. Without this, an emoji-heavy title could pass in the browser
    and fail on the server.
- **"treats whitespace-only text as absent"** — `'   '` becomes `null`, and a
  blank title is "required".
- **"accepts an absent optional subtitle but rejects an over-long one"** — 300
  characters pass, 301 fail.
- **"bounds titles and display names"** — title 160 passes, 161 fails; a
  display name of 81 fails.
- **"allows longer task titles and bounds notes separately"** — task title 500
  and 501; notes 5,000 and 5,001.
- **"collects only the real issues"**
  - 💭 Classic boundary testing: try N and N+1. The limits match
    `decisions.md` and the SQL constraints. The server validates again, so
    these exist for friendlier errors, not for security. Display name only has
    the "over" case; 80 exactly is untested.

### 3.4 Dates and deadlines — `domain.test.ts`

- **"defaults a date without time to the final millisecond of the local day"**
  — `2026-06-15` with no time becomes 23:59:59.999 local.
  - 💭 The rule from `decisions.md`. Weak spot: every assertion sits inside
    `if (result.ok && result.dueAt !== null)`. If the function returned
    `{ ok: true, dueAt: null }`, the test would pass having checked nothing.
    Assert the shape first, then check the time unconditionally.
- **"rejects a time without a date"**
- **"round-trips a local date and time through a UTC instant"**
- **"rejects malformed input rather than guessing"** — `15/06/2026` and `25:00`.
- **"never marks a completed task overdue"**
  - 💭 Requirement BR 08. Both TaskRow suites test it again on screen — good,
    since it is a rule people notice.

### 3.5 Avatars — `domain.test.ts`

- **"derives initials from one or more words, including Cyrillic"** —
  `Ana Petrova` → `AP`, `Борис Иванов` → `БИ`, blank → `?`.
- **"is deterministic for a given user id"** — the same hue every time, between
  0 and 359.
  - 💭 Bulgarian is a first-class language, so Cyrillic belongs in every text
    test. Determinism matters because the same person must have the same colour
    on web and Android.

### 3.6 Task status — `task-workflow.test.ts`

- **"follows assignment until explicitly blocked or completed"** — no assignee
  is Unassigned, an assignee is To-do, Blocked beats both, Done beats Blocked.
- **"stores only open, blocked or done"**
- **"labels the open option from the assignee, whatever the current state"**
  - 💭 A key concept: the database stores three states (open, blocked, done)
    and the UI shows four labels. Unassigned versus To-do is _derived_ from
    whether anyone is assigned. These tests are the definition of that mapping.

### 3.7 Up and down moves — `task-workflow.test.ts`

- **"stops at the ends and at a group boundary"** — an incomplete task cannot
  move down into the completed group.
- **"treats an index outside the rows as immovable"**
  - 💭 Decides when the arrows are disabled. The server enforces the same rule
    (`003_task_workflow.sql`, "move skips over the completed group").

### 3.8 Deadline filters — `task-workflow.test.ts`

- **"uses local midnight and an exclusive next midnight for Today"**
- **"overdue excludes completed and uses the current instant; upcoming begins
  tomorrow"**
- **"includes the entire last date in a range, including the DST transition
  day"** — 25 October 2026, when EU clocks go back.
  - 💭 In CI this never meets daylight saving: CI runs in UTC, where 25 October
    is an ordinary day. It passes when run under `TZ=Europe/Sofia`, so the code
    is right; the CI evidence is just thinner than the name suggests. See
    [§18.1](#181-time-zones-are-not-pinned).
- **"rejects invalid or reversed dates %s through %s"** (4 cases: 30 February,
  empty, reversed, month 13)
  - 💭 `2026-02-30` is the classic trap: `new Date` silently rolls it to
    2 March.
- **"keeps no-deadline and all-deadlines queries distinct"**

### 3.9 Editor drafts and row actions — `task-workflow.test.ts`

- **"starts a new task empty and an existing one from its fields"**
- **"names the message for each deadline problem"**
- **"offers block or unblock only on open tasks, and unassign only when
  assigned"**
- **"offers nothing the screen did not wire"**
  - 💭 `taskRowActions` is the single source of which menu entries exist; both
    clients' TaskRow tests check what gets rendered. Logic tested here,
    rendering tested there — good layering.

### 3.10 Today and Tasks views — `task-views.test.ts`

All cases use a fixed "now" of Sunday 11 October 2026, 14:00 local time.

- **"puts every task in exactly one group"** — overdue, today, upcoming,
  undated or done.
  - 💭 Note that a task due at 09:00 _today_ is overdue, not "today": "today"
    means "still to come today". Worth knowing when you read the UI.
- **"renders non-empty groups in order, each due-ascending with undated last"**
- **"Mine and Unassigned never include done tasks, matching their server
  reads"** — even with "show done" on.
  - 💭 The client filters one household read itself, so this keeps it in step
    with what `get_my_tasks_v2` and `get_unassigned_v2` would return.
- **"Everyone shows done tasks only on request"**
- **"applies the server deadline semantics, including overdue excluding done"**
- **"rejects an invalid range rather than showing everything"**
  - 💭 Fail closed. An invalid filter that showed every task would look as if
    the filter had worked.
- **"searches title, notes and list title case-insensitively"** —
  `'  LANDLORD '` finds a note.
- **"can narrow to blocked work"**
- **"counts open work only"** — overdue 1, due today 1, unassigned 1, blocked 1,
  mine 1, everyone 3.
- **"leaves Today's undated work to a count unless it is all the member has"**
- **"recognises view names"** — also covers the deadline presets.
  - 💭 These type guards protect URL parameters such as `?view=` from arbitrary
    input.

### 3.11 New passwords — `password.test.ts`

- **"counts characters without trimming or changing the password"** — spaces
  count, four emoji are too short, a case difference is a mismatch.
  - 💭 Three assertions telling one story: the password is exactly what the
    person typed. Never trim a password.

## 4. Translations

`packages/i18n/src/i18n.test.ts`

- **"declares exactly the same keys in both languages"**
- **"has no empty or whitespace-only strings"**
- **"uses the same placeholders in both languages"**
- **"translates every error code the contract defines"**
- **"leaves Bulgarian actually translated, not copied from English"** — only
  `app.name`, `locale.en` and `locale.bg` may match.
  - 💭 `code-standards.md` relies on this block as a gate. The last test is
    clever: it catches a copy-pasted English dictionary posing as Bulgarian.
- **"substitutes named parameters"**
- **"leaves an unknown placeholder visible instead of printing undefined"**
  - 💭 A visible `{title}` is ugly but debuggable; "undefined" on screen is
    worse.
- **"binds a locale once through createTranslator"**
- **"reports an empty list as nothing to do, not nothing done"**
- **"names the weekday and month in the member language"**
- **"maps device locales onto the supported set"** — `bg-BG` → `bg`,
  `de-DE` → `en`, nothing → `en`.
- **"builds one formatter per locale and style, however many rows it formats"**
  - 💭 A performance test: `Intl.DateTimeFormat` is expensive to build. The
    `toBeLessThanOrEqual(1)` allows for a cache an earlier test already warmed,
    which keeps it independent of test order.
- **"builds a new formatter when the device changes time zone"**
- **"shows only the time for today, and nothing for an end-of-day deadline"**
- **"shows a short weekday and date on other days, with the year only when it
  differs"**

## 5. Talking to the server

`packages/data` is the only code allowed to import Supabase. Its tests replace
the Supabase client with a fake `rpc` or `from` function, so they prove the
adapter sends the right call and reads the answer correctly — not that the
server works.

### 5.1 Turning errors into safe messages — `data.test.ts`

- **"prefers our own envelope carried in the error details"**
- **"falls back to the raised code when details are absent"**
- **"maps transport codes that have an unambiguous equivalent"** — `PGRST301`
  → `UNAUTHENTICATED`, `42501` → `FORBIDDEN`.
- **"never leaks SQL text into the user-facing message key"**
  - 💭 A security test: SQL error text can reveal table names. Checking
    `JSON.stringify` of the whole result is the right, paranoid way to do it.
- **"ignores a malformed details payload instead of throwing"**
- **"treats a fetch failure as NETWORK so the retry reuses the request id"**
- **"treats an aborted request as NETWORK"**
- **"falls back to UNKNOWN for anything else"**
- **"unwraps a success envelope"**
- **"unwraps a failure envelope and keeps current_version"**
- **"reports UNKNOWN when the payload parses into an unexpected shape"**
- **"rejects an unrecognised error code rather than trusting it"**
  - 💭 The theme of the block: anything the client does not recognise becomes
    `UNKNOWN`. Unchecked server text never reaches the screen.

### 5.2 Which reads to refresh — `data.test.ts`, `realtime.test.ts`

- **"invalidates every view a task change can move a task between"**
- **"omits the list key when the list is unknown"**
- **"names every affected key once"**
- **"covers everything a membership change affects"**
- **"affects nothing for an empty batch"**
  - 💭 A missing key here means a screen showing stale data after an edit.
    The limit: a brand-new query key is only covered once someone adds it to
    these expectations.

### 5.3 Request IDs — `request-id.test.ts`

- **"uses browser crypto by default"**
- **"uses the native adapter without requiring browser crypto"** — removes the
  global `crypto` and injects a generator.
  - 💭 Android cannot rely on `crypto.randomUUID`, so the app injects
    `expo-crypto`. The `afterEach` puts the default back — always clean up an
    injected global.

### 5.4 Commands pick the right RPC

`list-features.test.ts`

- **"uses the additive create RPC when a note is supplied"** →
  `create_list_v2`.
- **"keeps the legacy update RPC when a note is omitted by an older flow"** →
  `update_list`, with no `notes` field.
- **"clears a note through the additive RPC rather than the legacy one"** →
  `update_list_v2` with `notes: null`.
  - 💭 Subtle and important: _no_ notes field means "leave the note alone",
    while `notes: null` means "clear it". Mixing them up would silently wipe a
    note, or fail to.
- **"sends only the source list and returns the new template id"**
- **"never writes a task template, so task templates stay loadable on their
  own"** — exactly one RPC call, none of them `save_task_template`.
  - 💭 Only proves the client makes no second call. The real guarantee is on
    the server ([§16.2](#162-behaviour--002_behaviorsql-47-assertions) and
    [§17.2](#172-sql-text-checks--toolingtestsdatabase-statictestmjs)).

`task-features.test.ts`

- **"uses the additive create RPC when notes are supplied"** →
  `create_task_v2`.
- **"keeps the legacy update RPC when notes are omitted by an older flow"** →
  `update_task`.
  - 💭 The same v1/v2 pattern as lists. Risk R5 explains why both generations
    of RPC stay alive.

`task-workflow.test.ts`

- **"sends the stored state, never a display label, with version and request
  id"**
- **"moves each entity with version protection and a stable request
  envelope"**
  - 💭 These check the _whole_ argument object, so an extra or renamed
    parameter fails. That strictness is right at an API boundary.

### 5.5 Reads — `task-workflow.test.ts`, `task-detail.test.ts`

- **"reads each collection in one call, with no cursor"** — `get_home_v2`,
  `get_list_v2`, `get_my_tasks_v2`.
- **"resolves deadline filters against one instant"** — Overdue sends "before
  now, incomplete only".
- **"rejects invalid ranges before issuing a read"** — no RPC call at all.
- **"surfaces an oversized collection as TOO_LARGE rather than a partial
  result"**
- **"loads the complete task directly, restricted to an open parent"** — reads
  `tasks` joined to `lists!inner(status)` with `lists.status = open`.
- **"uses the same non-disclosing error for absent and inaccessible tasks"**
- **"sanitizes transport errors and rejects malformed rows"**
  - 💭 The task-detail test checks the exact query-builder calls, which leans
    towards the "implementation shape" that `code-standards.md` discourages.
    It is justified here: the inner join _is_ the behaviour, because a task in
    an archived list must look not-found. The real proof is the RLS tests.

### 5.6 Realtime batching — `realtime.test.ts`

These use fake timers so the test controls time.

- **"delivers a lone change at once"**
- **"turns a burst of row events into one immediate and one closing batch"** —
  copying a twenty-task template yields two batches, not twenty-one.
- **"keeps a steady stream to one batch per window"** — at most four batches in
  about 1.2 seconds.
- **"delivers by the clock when timers are paused, as Android does in the
  background"**
- **"does not hold hints when the device clock is set back"**
- **"reports health until the caller leaves, then stays silent"** — and the
  channel is removed exactly once.
  - 💭 This is the R12 fix that took a template copy from 105 requests per
    device to 8. The two clock tests are edge cases most people forget:
    Android freezes timers in the background, and people change their clocks.
    A strong suite.

## 6. Sign-in, registration and password recovery

Everything here is mocked. None of it sends or receives an email (risk R1).

### 6.1 The adapter — `packages/data/src/password-auth.test.ts`

- **"requests confirmation at the exact caller-supplied URL, trimming only the
  email"**
- **"does not disclose an existing account"** — `user_already_exists` is
  reported as an ordinary success.
  - 💭 Defence against account enumeration: nobody can learn who has an
    account by trying to register with their address.
- **"maps %s without exposing provider text"** (4 cases: wrong credentials,
  unconfirmed email, weak password, rate limit)
- **"maps network failures and preserves the original password"** — the email
  is trimmed, the password with its spaces is passed as-is.
- **"uses recovery and resend APIs without recreating accounts"**
- **"rejects a failed callback instead of reporting a previous session as
  success"**
- **"surfaces same-password rejection"**
  - 💭 Solid. The client is a real `createOdinClient` with its auth methods
    spied on, so the test also proves the real client has methods by those
    names.

### 6.2 Web screens — `apps/web/src/routes/password-auth.test.tsx`

- **"signs in an existing short-password account and preserves the invitation
  destination"**
  - 💭 Two rules: the 8-character minimum applies only to _new_ passwords, and
    `?next=/invite` survives the sign-in.
- **"shows a safe invalid-credentials error and clears password"**
- **"validates registration before making any request"**
- **"shows confirmation instructions and a resend cooldown without storing
  password"** — the password field is gone and resend is disabled for 60 s.
- **"uses a generic password-reset acknowledgement"** — "If an eligible account
  exists…".
- **"refuses direct reset navigation using a normal signed-in session"**
  - 💭 Being signed in is not enough to change a password on the reset page;
    you must have arrived through a recovery link. Otherwise anyone at an
    unlocked computer could change it without knowing the old one.
- **"updates a recovered account password and clears the recovery marker"**
- **"blocks offline submissions"**

### 6.3 Android screens — `apps/mobile/src/state/password-auth.test.tsx`

Sign-in

- **"clears the password even if an unexpected exception escapes the
  adapter"**
- **"preserves the invitation destination on the recovery detour"**
- **"reports a wrong password generically and drops it from state"** — the
  email stays, the password goes.
- **"never applies the new-password policy to an existing account"** — sends
  `'  someone@example.test  '` and `'short'` untouched.
  - 💭 The screen passes the email untrimmed and the adapter trims it
    ([§6.1](#61-the-adapter--packagesdatasrcpassword-authtestts)). One rule,
    two tests in two packages — remember both if you change either.
- **"starts no second request while one is still in flight"**
- **"resolves %s to %s (%s)"** (5 cases: two external URLs and two auth routes
  go home; `/invite` is kept)
- **"offers a resend only once the server says the email is unconfirmed"**
  - 💭 The assertion matches "You can request a new code in…", the
    `auth.code.resend_in` string from the one-time-code era. The flow now sends
    a link, so the test pins stale wording. Harmless, but worth a copy fix.
- **"submits nothing while offline"**

Registration

- **"rejects a short password before spending a request"**
- **"rejects a mismatched confirmation before spending a request"**
- **"clears both passwords, explains the browser step and holds off a
  resend"**
- **"routes straight on when a local stack returns a session"** — a local
  Supabase needs no email confirmation.

Password recovery

- **"returns to sign-in with the invitation destination intact"**
- **"acknowledges without revealing whether the account exists"**

### 6.4 Double-submit guard — `apps/mobile/src/state/useAuthRequest.test.tsx`

- **"runs only the first of two calls made in the same tick"**
  - 💭 The best test in the auth area. A double tap fires two handlers before
    React re-renders, so a `disabled` flag alone cannot stop the second one —
    a ref can. This test exercises exactly that gap.
- **"refuses to run at all while offline"**
- **"holds off a second mail-sending call for the cooldown"**
- **"lets a non-mailing call through during that cooldown"**

## 7. Sessions, identity and safe navigation

### 7.1 Switching accounts on the web — `apps/web/src/app/OdinProvider.test.tsx`

- **"clears cached household data on account change and external signout"**
- **"does not let an older initial session overwrite a newer login event"**
  - 💭 A classic race: at start-up the app asks "who is signed in?" (slow) and
    meanwhile a sign-in event arrives (fast). The slow answer must not win.
    Both clients test it.

### 7.2 Switching accounts on Android — `apps/mobile/src/state/OdinProvider.test.tsx`

- **"discards local drafts on identity changes, but keeps them across token
  refresh"**
- **"drops the previous account's cached data when the identity changes"**
- **"keeps the cache when the same account is re-announced"**
- **"clears the cache on sign-out"**
- **"does not let a slow session lookup resurrect a replaced identity"**
- **"survives signing in, which is the whole point of holding it"** — a pending
  invitation.
- **"is discarded when the account changes or signs out"**
- **"re-renders consumers for a sync only when the displayed minute changes"**
  - 💭 A performance test with fake system time. It also checks that the
    translator keeps one identity, so components using it do not re-render for
    nothing.
- **"tells React Query and the loading screen when the device goes offline"** —
  and "connected but reachability still unknown" is _not_ offline.
  - 💭 Android's suite is richer than the web's (drafts, invitations,
    offline). Changes to the web provider have less of a safety net.

### 7.3 Android sign-in gate and onboarding — `apps/mobile/src/state/account-routing.test.tsx`

- **"offers retry instead of onboarding when %s fails"** (2 cases: profile,
  household)
  - 💭 An important failure-mode test. If loading your household fails, the app
    must not conclude "you have no household" and send you off to create one.
    It also checks the provider's error text never reaches the screen.
- **"hydrates the saved profile language and renders an existing household"**
- **"asks an invited new user for a profile, then opens their existing
  household"**
- **"does not offer household creation on an onboarding query error"**
- **"sends a signed-out direct onboarding visitor to sign-in"**

### 7.4 Android session storage — `apps/mobile/src/session-storage.test.ts`

The Android keystore limits the size of each stored value and a Supabase
session is bigger, so the adapter splits it into chunks.

- **"round-trips a small value without chunking it"**
- **"round-trips a session larger than the keystore value limit"** — a manifest
  plus chunks of at most 512 characters.
- **"never splits a surrogate pair across two chunks"** — an emoji placed
  exactly on the 512-character boundary.
  - 💭 An excellent edge case. Half an emoji is invalid text, and storage may
    mangle it, corrupting the session.
- **"reports a partially written session as absent rather than corrupt"**
- **"clears every chunk when the session is removed"**
- **"does not leave stale chunks behind when a shorter session replaces a
  longer one"**
- **"reads the keystore once, then answers from memory"** — five reads in total
  (manifest and four chunks), not five per request.
- **"serves the newest write and removal from memory"**
- **"does not let a slow first read overwrite a newer write"**
- **"keeps a sign-out even when the keystore delete fails"**
  - 💭 Read the name carefully: it proves the _running_ app treats you as
    signed out. It does not check a restart. `removeItem` clears memory and
    then deletes from the keystore, so if that delete fails the chunks are
    still on disk and the next launch would read them back. Probably rare, but
    the name promises more than the test checks.

### 7.5 Android token refresh — `apps/mobile/src/state/useSessionRefresh.test.tsx`

- **"refreshes in the foreground, stops in background and removes its
  listener"**
  - 💭 Refresh timers should not run in the background. The listener cleanup
    on unmount matters too: leaked AppState listeners are a common React
    Native bug.

### 7.6 Safe redirects

A `?next=` destination is attacker-controlled, so it must be an internal path.

Web, `apps/web/src/routing.test.ts`

- **"keeps a genuine internal destination"**
- **"refuses absolute and protocol-relative URLs"**
- **"refuses backslash and scheme tricks browsers may normalise"** —
  `/\evil.example` and `javascript:`.
- **"refuses control characters and empty input"**
  - 💭 Open-redirect defence. `//evil.example` looks like a path but browsers
    treat it as another site, and some browsers turn `/\evil` into `//evil`.
    These are real attacks.

Web, `apps/web/src/auth-links.test.ts`

- **"prevents external and authentication-loop destinations"** — external
  hosts, `/sign-in`, `/reset-password`, `/SIGN-IN/`, the percent-encoded
  `/%73ign-in` and a broken `/%broken` all go home; `/invite` is kept.

Android, `apps/mobile/src/routing.test.ts`

- **"keeps an ordinary in-app destination"**
- **"refuses %s (%s) and falls back to Home"** (6 cases)
- **"falls back to Home when no destination was supplied"**
- **"keeps a genuine destination so a deep link still lands where it meant
  to"**
- **"refuses %s (%s) so login cannot loop"** (6 cases)
- **"still rejects everything an unsafe path rejects"**
  - 💭 The same rules, tested twice, because `apps/web/src/routing.ts` and
    `apps/mobile/src/routing.ts` are two hand-written copies.
    `code-standards.md` asks for shared rules to live once; this one could move
    into `@odin/domain`. Until then the twin tests at least keep the copies in
    step.

### 7.7 Configuration

`apps/web/src/env.test.ts` and `apps/mobile/src/env.test.ts` carry the same
seven cases; where the wording differs, both names are given.

- **"returns trimmed public Supabase configuration"**
- **"reports every absent client variable"**
- **"treats whitespace-only values as missing"**
- **"normalises a configured trailing slash away so request paths stay
  single-separated"** (web) / **"normalises a configured trailing slash
  away"** (Android)
- **"rejects a present but malformed URL rather than building an unusable
  bundle"** (web) / **"rejects a present but malformed URL rather than
  shipping a broken build"** (Android)
- **"refuses plaintext against a remote host"**
- **"allows plaintext against the local development stack"** (web,
  `127.0.0.1`) / **"allows plaintext against the emulator route to a local
  stack"** (Android, `10.0.2.2`)
  - 💭 Fail at start-up, not at the first request. The Android twin knows that
    `10.0.2.2` is how the emulator reaches your laptop.

Android release gate, `apps/mobile/scripts/validate-build-env.test.mjs`
(`node:test`; the script runs before every EAS build)

- **"accepts the hosted Odin project and a publishable key"**
- **"rejects missing values without exposing configuration values"**
- **"rejects a different Supabase project"**
- **"rejects a secret or legacy key"**
  - 💭 Stricter than the runtime reader: a release may target only Odin's own
    hosted project, with a publishable key. This is "Odin must stay separate
    from Passport" enforced in code.

## 8. Invitations and email links

Web, `apps/web/src/auth-links.test.ts`

- **"strips bearer tokens before session restoration and routes recovery to its
  form"**
  - 💭 Tokens arrive in the URL fragment. Removing them from the address bar
    straight away stops them leaking through history, screenshots or
    copy-paste. It also checks the stored recovery marker holds no token.
- **"rejects malformed/expired link %s and clears recovery state"** (3 cases)
- **"does not consume invitation fragments"** — `#token=` on `/invite` is left
  for the invitation page.
- **"rejects failed session restoration"**
- **"keeps invitation state across route unmounts until explicitly cleared"**

Web, `apps/web/src/routing.test.ts` › `captureInviteToken`

- **"reads the token from the fragment and clears it from history"**
- **"accepts a bare fragment token"**
- **"returns null when there is no fragment"**

Android, `apps/mobile/src/routing.test.ts` › `tokenFromDeepLink`

- **"ignores non-invitation link %s"** (3 cases)
- **"accepts the production web invitation path"**
- **"reads the token out of the link fragment"**
- **"ignores a token placed in the query string"**
  - 💭 Deliberately strict. A query string is sent to servers and logged; a
    fragment is not. Accepting `?token=` for convenience would undo the
    contract's privacy rule.
- **"returns null for a link without a token"**

Android, `apps/mobile/src/state/useInvitationLinks.test.ts`

- **"does not resurrect a cleared launch invitation but accepts a newly opened
  link"**
  - 💭 Android's launch link is returned every time you ask for it. Without
    this guard, a used invitation would come back after each cold start. The
    module-level state is only cleared on the last line, so a second test
    added here would inherit it after a failure.

No client test creates or redeems an invitation through the adapter or the
invitation screens. The server side is covered in
[§16.2](#162-behaviour--002_behaviorsql-47-assertions).

## 9. Lists, task rows and menus

### 9.1 Web task row — `apps/web/src/components/components.test.tsx`

- **"toggles completion without ever opening the task"**
- **"sends the explicit desired state rather than a toggle"**
  - 💭 A contract rule. If a double click sent "toggle" twice, the task would
    end where it started; sending "complete" twice is harmless.
- **"exposes completion state to assistive technology"** — `aria-pressed`.
- **"spells out overdue instead of relying on colour"**
- **"never marks a completed task overdue"**
- **"shows the assignee name in full beside the avatar"**
- **"names an unclaimed task as unassigned for assistive technology only"** —
  the text carries the `visually-hidden` class.
- **"shows a status label only when the task is blocked"**
- **"leaves an undated deadline empty instead of saying so on every row"**
- **"gives the claim action a descriptive accessible name in Bulgarian"**
- **"shows move controls only in reorder mode"**
- **"opens full task details from the title without toggling completion"**
  - 💭 Most assertions find elements by role and accessible name, which is what
    a screen reader sees. If these break after a refactor, a blind user's
    experience broke with them.

### 9.2 Web dialogs and menus

`components.test.tsx` › Dialog

- **"closes on Escape without saving"**
- **"moves focus into the dialog and returns it to the trigger on close"**
- **"is announced as a modal with an accessible name"**

`overflow-menu.test.tsx` › OverflowMenu

- **"stays closed until asked, and closes again on a second press"**
- **"orders destructive items last whatever order the caller passed"**
- **"opens on ArrowDown with the first item focused, and on ArrowUp with the
  last"**
- **"roves with the arrow keys and wraps at both ends"** — and Home and End.
- **"returns focus to the trigger after choosing an item"**
- **"closes when a press lands outside it"**
  - 💭 The standard accessible menu-button pattern, tested key by key. If you
    ever swap in a component library, run these against it.

`overflow-menu.test.tsx` › TaskRow actions

- **"keeps block, unassign and delete behind the overflow, delete last"**
- **"offers Unblock on a blocked task, which reopens it"** — sends `open`.
- **"names the overflow after its own task, so sibling rows are
  distinguishable"**
- **"offers no unassign entry when the task has nobody on it"**
- **"renders no action group at all for a read-only template row"**

`overflow-menu.test.tsx` › ConfirmDialog

- **"focuses Cancel on open so Enter never destroys anything"**
- **"confirms only when the destructive button is pressed"**
- **"disables the destructive button while the command is in flight"**
- **"is fully translated, so no browser-chrome English leaks into Bulgarian"**
  - 💭 That last test is why the app does not use `window.confirm()`: the
    browser's dialog cannot be translated or styled.

### 9.3 Web list detail — `ListTasks.test.tsx`

- **"keeps moves inside completion groups and sets state from the row menu"**
- **"hides move controls outside reorder mode and collapses completed tasks"**
  — behind a "Done · 1" expander.
- **"lets a template reorder its tasks without offering any runtime state"**
  - 💭 Template tasks can be moved but never completed, blocked or assigned —
    the same rule the SQL enforces.

### 9.4 Web list editing and templates — `list-templates.test.tsx`

- **"offers the note after the subtitle and submits what was typed"** — an
  empty subtitle is sent as `null`.
- **"starts from the list the household already has"**
- **"rejects a note over the shared 5,000 limit before it reaches the
  server"**
- **"shows the note under the subtitle"**
- **"saves the list as a template from the list menu"**
- **"offers a template nothing but Delete, since it is otherwise read-only"**
- **"keeps edit, save-as-template and delete in one menu on an active list"**
- **"confirms a template save briefly and links to it"** — the toast.

### 9.5 Android task row — `apps/mobile/src/components/TaskRow.test.tsx`

The Android twin of §9.1.

- **"keeps completion and opening the task as separate controls"**
- **"opens task details from the task body while keeping row actions
  independent"**
- **"sends an explicit desired state rather than a toggle"**
- **"exposes completion as a checkbox state for TalkBack"**
- **"changes a task state from the overflow without triggering row details"**
- **"shows a status label only when the task is blocked"**
- **"offers Claim on an unclaimed task, named after the task"**
- **"offers Unblock on a blocked task, which reopens it"**
- **"disables move controls at the visible ordering boundaries in reorder
  mode"**
  - 💭 The final `expect(onMove).not.toHaveBeenCalled()` cannot fail, because
    nothing pressed the buttons. Compare ListCard's "refuses a second move
    while one is in flight", which does press.
- **"spells out an overdue deadline instead of signalling it by colour"**
- **"never calls a completed task overdue"**
- **"names the assignee in text, never by avatar alone"**
- **"tells TalkBack an unclaimed task is unassigned without a visible label"**
  - 💭 Only checks that the text exists, not that it is hidden; the web twin
    checks the `visually-hidden` class. If someone made the label visible,
    this would still pass.
- **"offers no completion or edit control on a read-only template row"**
- **"keeps secondary task actions in an Android overflow menu"**

### 9.6 Android list cards — `ListCard.test.tsx`

- **"shows the shared note under the subtitle"**
- **"saves an active list as a template from its menu"**
- **"offers Use template on a template row"**
- **"keeps deletion in the overflow and never offers task-template actions"**
- **"lets a template be deleted but never saved as another template"**
- **"exposes ordered-list controls in reorder mode with the boundary
  disabled"**
- **"refuses a second move while one is in flight"**
  - 💭 This one is about correctness as much as UX: a second move sent before
    the first refetch would carry a stale version and get `CONFLICT`.

### 9.7 Android render cost — `ListDetailSections.test.tsx`

- **"renders again only the row whose task changed"**
  - 💭 A clever technique: the mocked ActionMenu records each render, so the
    number of menus equals the number of row renders. It proves memoisation
    works with the query cache. Copy this pattern for any "this should not
    re-render" claim.

## 10. Task details and editing

Web, `TaskDetailsDialog.test.tsx`

- **"shows notes, assignee and deadline read-only"** — the only button is
  Close.
  - 💭 Depends on the machine's time zone: it expects "5 Apr 2030" for 15:30
    UTC, which is already 6 April east of UTC+8. It fails under
    `TZ=Asia/Tokyo`. See [§18.1](#181-time-zones-are-not-pinned).

Web, `TaskDetailsFlow.test.tsx`

- **"keeps the draft through a conflict and resubmits against the latest
  version"**
  - 💭 Probably the most valuable UI test in the repository. It walks the whole
    optimistic-concurrency story: edit, get `CONFLICT`, press "Review latest",
    find your typed text still there, save again with the _new_ version.
    Android has no equivalent.
- **"offers no editor for a template task"**

Android, `TaskDetailsSheet.test.tsx`

- **"shows the full notes, assignee and deadline with only a close action"**
- **"says plainly when a template task has no assignee or deadline"**

## 11. Command plumbing

`apps/web/src/app/useCommand.test.tsx` lives in the web app but tests
`useCommand` and `useTaskRowActions` from `@odin/data`, which Android uses too.

- **"reuses the same request id when a NETWORK failure leaves the outcome
  unknown"** — run, retry, run: one ID throughout.
- **"mints a fresh request id after a success, so a second create really
  creates"**
- **"mints a fresh request id after a definite failure such as CONFLICT"**
- **"surfaces the conflict error with the server current_version"**
- **"retry is a no-op before anything has been sent"**
  - 💭 The comment at the top of this file is the best two-sentence
    explanation of idempotency in the repository. Read it first.
- **"stays pending until the affected reads have refetched"**
  - 💭 If the button re-enabled the moment the write returned, a quick second
    click would send the _old_ version still on screen and hit `CONFLICT`.
    Staying pending until the refetch lands prevents that.
- **"sends the chosen state with the row version and offers retry only for
  NETWORK"**
  - 💭 These shared hooks are tested only from the web workspace. That is fine
    while the code is identical on both clients, but nothing would notice
    Android-specific behaviour if `@odin/data` ever grew any.

## 12. Today and Tasks screens

`apps/web/src/routes/task-views.test.tsx` builds its tasks relative to the real
current date, so it does not depend on a fixed day.

- **"shows only the member's open tasks by default, with counts on every
  view"** — Mine 1, Unassigned 1, Everyone 3.
- **"groups by deadline and spells out overdue"**
- **"combines view, search and the done toggle"**
- **"opens with a tile's filter already applied"** — `?blocked=1`.
- **"counts open work and lists only the member's own tasks"** — Today's tiles
  link to the matching filtered Tasks address.
  - 💭 A good integration level: real screens, real domain filters, only the
    queries mocked. Android has no counterpart; its Today and Tasks screens
    rely on the shared domain tests in [§3.10](#310-today-and-tasks-views--task-viewstestts).

## 13. Navigation on Android

`useBottomNavVisibility.test.ts`

- **"starts visible"**
- **"hides on a downward scroll and reveals on an upward one"**
- **"ignores jitter below the drag threshold"** — a four-pixel twitch.
- **"stays visible at the top of the content"**
- **"stays visible at the end of the content"**
- **"stays visible while a screen pins it"**
  - 💭 Requirement FR 21. The edge cases (top, bottom, jitter) are exactly the
    ones that annoy people on a real phone.

`useEvent.test.tsx`

- **"keeps one identity across renders and runs the latest handler"**
  - 💭 A small utility: a callback whose identity never changes but always runs
    the latest logic, which lets memoised rows skip re-rendering.

## 14. Live sync

The batching underneath is in [§5.6](#56-realtime-batching--realtimetestts).
This is the Android hook on top, `apps/mobile/src/state/useHouseholdRealtime.test.tsx`.

- **"keeps one channel across background, foreground and network changes"**
- **"reconciles after the first join, then once per return to the
  foreground"**
- **"reconciles when the channel recovers, unless the app is away"**
- **"backs the fallback poll off to once a minute and stops it on recovery"** —
  5, 10, 20, 40, 60, 60 seconds.
- **"does not poll while the app is in the background"**
- **"invalidates each affected key once for a batch of changes"**
- **"starts at five seconds and caps at one minute"**
  - 💭 The `reconciles()` helper counts refreshes of the `household` key as one
    reconcile. Clever, but it assumes every reconcile starts with membership;
    change that order and these counts break for no real bug. The web
    realtime hook, which still polls every 3 seconds (R12), has no tests at
    all.

## 15. Notifications

Notifications exist only on Android. Every test below runs against a fake
notification service; none proves Android actually shows anything (risk R9).

### 15.1 The decisions — `packages/domain/src/notifications.test.ts`

Deadline reminders, `planDueReminders`

- **"plans all three stages at the owner-selected offsets"** — 24 hours,
  4 hours, 1 hour.
- **"skips a stage whose moment has already passed"**
- **"plans nothing for a deadline inside its own last hour"**
- **"plans nothing for an overdue deadline"**
- **"ignores tasks with no deadline and unparseable ones"**
- **"plans one task once even when it arrives from two lists"**
- **"keys a reminder by task and stage so replanning replaces it"**
- **"carries the text the reminder needs so the planner is the only source"**

Announcements, `diffAssignedTasks`

- **"reports nothing against a null baseline"**
- **"reports a task that was not assigned to me before"**
- **"reports a task of mine whose version advanced"**
- **"says nothing when a refetch returns identical rows"**
- **"says nothing about a task that left my list"**
- **"ignores a stale read that reports an older version"**
  - 💭 Model tests: pure functions, with comments that explain the product
    reason inline. The "null baseline" comment is how to record intent in a
    test.

### 15.2 Delivery logic — `apps/mobile/src/state/useTaskNotifications.test.tsx`

Announcing changes

- **"takes the first reading as a silent baseline"**
- **"announces a task that has become yours"**
- **"announces an edit to a task of yours"**
- **"says nothing while you are looking at the app, and nothing later about
  it"**
- **"collapses a burst into one summary rather than a stack"**
- **"says nothing at all when notifications are off"**
  - 💭 Three of these check that _nothing_ happened by putting the check inside
    `waitFor`. `waitFor` stops at the first passing check, and an empty list
    passes at once, so a notification arriving a moment later would not be
    caught. For "nothing should happen", let pending work finish first and
    then assert once.

Deadline reminders

- **"schedules one reminder per stage, keyed by task, stage and language"**
- **"covers unassigned tasks as well as your own"**
- **"leaves reminders already in place alone"**
- **"cancels reminders when the deadline is removed"**
- **"cancels reminders when the task leaves your lists entirely"**
- **"re-words reminders when the member changes language"**
- **"holds no reminders while notifications are off"**
  - 💭 This last one mounts a _second_ hook with notifications off while the
    first, with them on, is still mounted, rather than switching one hook off.
    It passes because the second instance cancels everything, but it is an odd
    shape to copy.

### 15.3 The permission gate — `apps/mobile/src/state/NotificationSettings.test.tsx`

- **"is on once Android grants permission and nothing is muted"**
- **"reports a refusal that can still be asked about again as denied"**
- **"reports "do not ask again" as blocked rather than offering a useless
  button"**
- **"remembers a mute on the device and drops the reminders Android holds"**
- **"asks Android only when the member turns notifications on"**
- **"sends a blocked member to the Android settings instead of a dead
  button"**
- **"offers to turn notifications on while they are off"**

## 16. The database

These run against a real Postgres. pgTAP files run inside one transaction that
always rolls back.

### 16.1 Schema shape — `001_schema.sql` (32 assertions)

- Nine existence checks: the `private` schema; tables `profiles`,
  `households`, `memberships`, `lists`, `tasks`; private `command_receipts`,
  `invitations` and `system_secrets`.
- Lists have no `due_at`; they have a nullable `notes`.
- Tasks have a nullable, time-zone-aware `due_at`, a nullable `assignee_id` and
  a required `version`.
- RLS is enabled on the five public tables.
- `authenticated` may select tasks but not insert or update them, and cannot
  read `private.invitations`.
- Six RPC signatures exist: `create_list`, `create_list_v2`,
  `save_list_template`, `copy_template`, `claim_task`, `redeem_invitation`.
  - 💭 Structural tests catch a migration that drops or renames something; they
    prove no behaviour. Direct-write denial is checked here only for task
    insert and update. The wider "nothing granted to clients" rule is checked
    as text in [§17.2](#172-sql-text-checks--toolingtestsdatabase-statictestmjs)
    and behaviourally once in §16.2.

### 16.2 Behaviour — `002_behavior.sql` (47 assertions)

One long story with three people: Alice (household A), Bob (household B,
created directly by the test) and Carol (who joins A by invitation).

- **Profile and household** — Alice creates both; a second household is
  `ALREADY_IN_HOUSEHOLD`; a blank display name is `VALIDATION`.
- **Idempotency** — the same request ID returns the same list; the same ID
  with a changed payload is `IDEMPOTENCY_MISMATCH`.
- **Tasks** — a task is created; a new list starts at 0%; a direct insert into
  `tasks` is refused by Postgres (`42501`).
- **Copying a template** — both tasks copied, none keeps completion, assignee or
  deadline, and repeating the request returns the same copy.
- **List notes** — `create_list_v2` stores the note, legacy `update_list` keeps
  it, `update_list_v2` replaces it.
- **Saving a list as a template** — it becomes a template with both tasks and
  no runtime state; repeating is idempotent; a template cannot itself be saved
  as a template; no task template is written; the note travels to the template
  and on to a copy.
- **Deleting a template** — succeeds, archives it, keeps its tasks, stops it
  being copied, and refuses a second delete.
- **Invitations** — retrying creation returns the same token; Carol redeems it
  and lands in household A.
- **Claim and completion** — Carol claims a task; it leaves Unassigned and
  appears in My Tasks; completing it removes it from My Tasks and progress
  reads 50%; a stale completion is `CONFLICT`.
- **Isolation** — Alice sees one household and none of B's lists; editing or
  templating B's list is `NOT_FOUND` (not `FORBIDDEN`, so its existence is not
  revealed); the member list has two people starting with Alice; assigning Bob
  is `VALIDATION`; a junk invitation token is `VALIDATION`.
  - 💭 To debug, fix the _first_ failing assertion. Everything shares one
    transaction and hard-coded version numbers, so one early failure cascades.
  - 💭 Not covered, and also unchecked in `verification.md`: expired, revoked or
    used invitations, rate limits, an inactive member, and a receipt replay
    after losing membership.

### 16.3 Task workflow — `003_task_workflow.sql` (43 assertions)

- **Setup** — lists are appended at positions 0 and 1.
- **State** — `todo` is refused (labels are not states); block, done and
  reopen work; reopening clears both flags; blocking again advances the
  version exactly once; legacy `set_task_completed` clears Blocked.
- **Moves** — moving up swaps with the neighbour; a stale version is
  `CONFLICT`; moving past the top changes nothing; a move skips the completed
  group; lists swap the same way.
- **Templates** — a template task can move but not be blocked.
- **Snapshots** — templates come first on Home, then shared order, with no
  cursor; completed tasks sort last; counts cover the whole list; My Tasks
  carries list titles; Unassigned excludes claimed and completed tasks.
- **`get_all_tasks`** — a date window finds a task; the next day's window finds
  none; the undated filter returns two; a reversed range and "undated plus
  bounds" are both `VALIDATION`.
- **Ceiling** — 1,001 tasks make `get_list_v2` and `get_all_tasks` answer
  `TOO_LARGE`.
- **Isolation** — another household's tasks are invisible and its list is
  `NOT_FOUND`.
  - 💭 The assertion named "exclusive upper bound excludes earlier tasks"
    queries 26–27 October for a task due on the 25th, which really tests the
    _lower_ bound. A true upper-bound test would put a task at exactly
    `2026-10-26T00:00:00Z` and query 25–26.
  - 💭 The ceiling test builds `collection_limit() + 1` rows instead of
    hard-coding 1,001, so it follows the limit if it ever changes.

### 16.4 Races — `supabase/tests/concurrency.mjs` (5 cases)

Real transactions on separate connections, with two members.

- **Duplicate create** — the same request sent twice at once gives one task,
  one receipt and the same ID to both callers.
- **Competing claims** — exactly one member wins; the other gets
  `ALREADY_ASSIGNED` or `CONFLICT`.
- **Parallel append** — two new tasks get distinct, consecutive positions.
- **Move while the neighbour is deleted** — B deletes a task and holds the
  transaction open; the test waits until A's move is actually blocked on a
  lock, then lets B commit; the move settles cleanly.
- **Competing adjacent moves** — two members swap the same pair from opposite
  sides; one wins, one gets `CONFLICT`, no position is duplicated.
  - 💭 Only the neighbour-delete case _forces_ the overlap, by polling
    `pg_stat_activity` until a connection is waiting on a lock. The other four
    send two requests together and hope they overlap. If they ran one after the
    other, the same assertions would still pass, so a green run does not prove
    the race happened. `contract.md` asks for "genuine simultaneous
    transactions"; the neighbour-delete case shows how to guarantee it.
  - 💭 Three races named in the contract have no test at all (risk R3):
    assignment against membership removal, two `create_household` calls, and
    two people redeeming one invitation.

### 16.5 Production smoke scripts — `supabase/smoke/*.sql`

Run by hand after a deployment, not by CI. Each opens a transaction, creates
random synthetic users, raises an exception at the first wrong answer and
always rolls back.

- **`lifecycle-smoke.sql`** — unauthenticated delete refused; unassigning keeps
  the deadline; stale deletes are `CONFLICT`; an outsider gets `NOT_FOUND`;
  deleting a task is idempotent and really removes it; deleting a list
  archives it, is idempotent and keeps its tasks; tasks in an archived list
  cannot be deleted.
- **`task-features-smoke.sql`** — a 500-character Cyrillic title with notes;
  idempotent replay; 501 characters refused; notes edited and kept by the
  legacy update; a task template saved and read; an outsider sees no templates
  and cannot edit the task.
- **`list-templates-smoke.sql`** — list notes end to end; saving, copying and
  deleting list templates, including the note, task notes, runtime reset and
  removal from Home; outsider isolation.
- **`task-workflow-smoke.sql`** — most of §16.3 again, plus the legacy paged
  readers that installed Android builds still call, and a six-way isolation
  check.
  - 💭 They overlap with pgTAP on purpose: pgTAP proves a migration on a fresh
    local database, smoke proves it on the real one. The forced rollback is
    what makes running against production safe (R4). Their evidence lives in
    `deployment-log.md`, not in CI.

## 17. Guardrails on the code itself

### 17.1 The linter — `tooling/tests/lint.test.mjs`

- **"lint enforces typed safety, layer boundaries, hooks and web
  accessibility"** — writes a throwaway TypeScript project under `apps/`,
  lints a bad file (`any`, a floating promise) and a clean one, then checks the
  resolved rules: web gets accessibility and hooks rules as errors, domain code
  may not import Supabase, Android gets no DOM accessibility rules.
  - 💭 "Testing the linter" sounds odd but is smart: a config change can quietly
    switch rules off, and a passing lint would then mean nothing. Note the
    `finally` block checks it is deleting the right folder before removing it —
    a good habit.

### 17.2 SQL text checks — `tooling/tests/database-static.test.mjs`

No database needed; these read the SQL files as text.

- **"database schema preserves product boundaries"** — no list deadline, the
  assignee membership key, the template-task constraint, the one-household
  index.
- **"every exposed table enables RLS and direct client writes stay revoked"**
- **"RPC and privileged helper boundaries are explicit"** — at least 18 public
  functions, each `security invoker` with an empty `search_path`; nothing
  granted to `anon`; no `service_role`.
- **"idempotency, conflict and invitation secrecy controls exist"**
- **"read helpers keep cursor and CTE semantics valid"**
- **"list and task lifecycle commands preserve version and household
  boundaries"**
- **"task notes and household templates preserve validation and authorization
  boundaries"**
- **"list templates and list notes keep their documented boundaries"**
- **"a template is deletable, and deleting any list still archives it"**
- **"every collected database test declares a pgTAP plan"**
- **"smoke scripts stay outside the collected test tree"**
  - 💭 Regular expressions over SQL: fast tripwires that run on every push,
    while the Database workflow only runs when `supabase/`, the package files
    or the workflow itself change. A comment
    containing the right words, or a reformatted statement, can fool them; the
    delete-list test already defends itself by extracting just the function
    body. Read them as "did someone delete this line?", not as proof of
    behaviour.
  - 💭 The last two exist because of a real incident
    (`supabase/smoke/README.md`): a plan-less script under `tests/` turned CI
    red without a single assertion failing.

## 18. Cross-cutting observations

### 18.1 Time zones are not pinned

Nothing sets `TZ` for Vitest or Jest, so tests run in the machine's zone; CI is
UTC. Running the Vitest suite under other zones on 2026-10-12:

| `TZ`                                   | Result                                     |
| -------------------------------------- | ------------------------------------------ |
| UTC, Europe/Sofia, America/Los_Angeles | 244 passed                                 |
| Asia/Tokyo, Pacific/Kiritimati         | 243 passed, 1 failed (`TaskDetailsDialog`) |

The Android Jest suite passed in all three zones tried. Two consequences: a
developer east of UTC+8 gets a red suite on a clean checkout, and the
daylight-saving test in §3.8 never meets daylight saving in CI. Running the
suite once under `TZ=Europe/Sofia` in CI, and fixing the one date assertion,
would close both.

### 18.2 Most race tests do not force the race

See §16.4. One of five guarantees the transactions overlap.

### 18.3 "Nothing happened" inside `waitFor`

See §15.2. A negative check inside `waitFor` passes on its first poll.

### 18.4 Everything above the database is mocked

A green client suite plus green pgTAP is good evidence, but no automated test
runs a client against a real database. Email (R1), notification delivery (R9)
and anything device-specific (the accepted device gap) have no automated
evidence at all.

### 18.5 Uneven coverage between the clients

| Behaviour                                                | Web                      | Android                         |
| -------------------------------------------------------- | ------------------------ | ------------------------------- |
| Conflict keeps the draft and resubmits                   | `TaskDetailsFlow`        | None                            |
| Today and Tasks screens                                  | `task-views`             | None (shared domain rules only) |
| Drafts and pending invitation dropped on account change  | None                     | `OdinProvider`                  |
| Offline signal to React Query                            | None                     | `OdinProvider`                  |
| Realtime fallback polling                                | None                     | `useHouseholdRealtime`          |
| Invitation page, redeeming a link                        | None                     | None                            |
| Copy template, claim, task templates through the adapter | None (UI callbacks only) | None (UI callbacks only)        |

### 18.6 Names that promise more than they check

- Sign-out survives a failed keystore delete only until restart (§7.4).
- "Unassigned without a visible label" never checks visibility (§9.5).
- "Disables move controls" never presses them (§9.5).
- "Exclusive upper bound" tests the lower bound (§16.3).
- The date-only deadline assertions sit behind an `if` (§3.4).

### 18.7 Smaller notes

- The redirect rules are two hand-written copies, one per client (§7.6).
- A test pins the stale "request a new code" wording (§6.3).
- `002_behavior.sql` is one dependent story; fix its first failure first
  (§16.2).
