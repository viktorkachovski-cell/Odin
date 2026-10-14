# Known risks

One place to see what is currently wrong, unproven or deliberately accepted in
Odin, so nobody has to reconstruct it from the other files. Opened 2026-09-22.

Each entry says what could actually go wrong, not just what is missing. An
entry leaves this file when it is fixed or when the owner accepts it, and
"accepted" means it moves to the last section rather than disappearing.

Nothing here is a to-do list for the next agent to pick up unprompted. Work an
entry when the owner asks for it.

## Open

### R1 — Email confirmation and recovery cannot be delivered

**Severity: high. Blocks new members joining.**

SMTP is not configured on the hosted project, so no confirmation or recovery
mail leaves it. A new member can register and then get stuck: the account
exists, the confirmation link never arrives, and sign-in refuses an
unconfirmed email. Password recovery is dead for the same reason.

Every automated test around this mocks the auth call. None of them is evidence
that mail arrives. Choosing the SMTP sender and provider is still an open item
in `docs/decisions.md`.

The Auth configuration this depends on is in `docs/operations.md`.

### R2 — Archived lists and templates are invisible and unrecoverable from the app

**Severity: medium, and growing.**

"Delete list" archives rather than deletes, and since 2026-09-22 that covers
templates too (`docs/features.md`). Nothing in either client can
list, restore or purge an archived row, so the only way back is an operator
with database access running SQL by hand.

Two consequences. A member who archives the wrong list has no self-service
recovery. And archived lists and their tasks accumulate forever, now faster
than before, with no retention story.

A restore view, or a `restore_list` command plus a purge policy, would close
it. Neither exists.

### R3 — Three contract races are untested

**Severity: medium.**

`npm run db:test:concurrency` runs in CI against a real local stack, but three
races named in `docs/contract.md` have no coverage:

1. An assignment racing the assignee's membership revocation.
2. Two concurrent `create_household` calls for one account.
3. Two accounts redeeming one invitation simultaneously.

Each is a correctness claim the contract makes and the suite does not check. A
regression in any of them would ship silently.

Recorded in `docs/database.md`.

### R4 — Previews read and write production data

**Severity: medium. Accepted in principle, still a live hazard.**

Odin runs one hosted Supabase project, deliberately (`docs/architecture.md`).
Every Vercel preview deployment therefore points at production. A preview of a
branch with a destructive bug operates on real household data, and there is no
staging copy to catch it first.

This is why every verification script in `supabase/smoke/` wraps itself in a
transaction that is forced to roll back, and why `supabase db reset` must never
be aimed at the hosted project.

### R5 — Legacy RPCs have no deprecation plan

**Severity: low, rising slowly.**

`create_list`, `update_list`, `create_task` and `update_task` are kept callable
and note-preserving so installed Android builds keep working, with `*_v2`
carrying the note-aware behaviour. Nothing records when they can be removed, or
how to find out whether any install still calls them.

Every future field on a list or task faces the same fork, so the surface grows
each time. A reading of `private.command_receipts` by `command_name` would show
whether the legacy pair is still in use.

The read side has the same problem: current clients read snapshots (`get_home_v2`, `get_list_v2`, `get_my_tasks_v2`,
`get_unassigned_v2`), while the paged `get_home`, `get_list`, `get_my_tasks`
and `get_unassigned` stay only for installed builds. Reads leave no receipt, so
nothing in the database shows when those can go.

Recorded in `docs/deployment-log.md` and
`docs/features.md`.

### R6 — Database backups contain the invitation signing key

**Severity: low, sharp edge.**

`private.system_secrets` holds a random HMAC key generated inside the database,
used to rederive invitation tokens for idempotent retries. Any backup of the
project therefore contains it and must be protected as a secret, not as
ordinary data. Rotating the key invalidates every outstanding invitation and
needs a deliberate procedure that is not written down anywhere.

Recorded in `supabase/README.md`.

### R7 — No membership exit, removal or account deletion

**Severity: low for now, blocking for release.**

`docs/decisions.md` item 3 is unresolved, so no UI exposes removal and no
policy exists for a member leaving or an account being deleted. The schema
handles an inactive membership, but nothing exercises what happens to that
member's assigned tasks, and equal permissions mean no member has authority to
expel another anyway.

### R8 — Web bundle is one ~611 kB chunk

**Severity: low.**

No code splitting; the whole app loads up front. Fine on a desktop connection,
noticeable on a slow phone. The 2026-10-11 cleanup build emitted 610.95 kB of
JavaScript before gzip, 173.64 kB gzipped (617.72 kB before it); Vite reports a
non-blocking size warning. Shared notification rules and strings also enter
the web bundle even though only Android notifies.

### R9 — Notification delivery is partial and unverified

**Severity: medium. The feature works less than its description suggests.**

Notifications (`docs/features.md`) are delivered by the device, because remote
push needs FCM credentials and a sender that do not exist
(`docs/decisions.md`, open decision 7). Three consequences follow.

A task becoming yours, or one of yours being edited, is only announced while
Odin's process is alive — foreground or recently backgrounded. Once Android
kills the process, nothing is announced until the member next opens the app,
and the baseline is then re-taken silently, so the change is never announced at
all. This is the notification people would most expect to get, and it is the
one least likely to arrive.

Deadline reminders are held by Android's alarm service and do fire with the app
closed, but they are scheduled inexactly. Doze can delay one past the moment it
describes, so a "due in 1 hour" reminder can arrive rather less than an hour
before.

A reminder can also outlive the work. Reminders are reconciled only while the
app runs, so if another member completes or reschedules a dated task while
Odin is closed, the alarm Android already holds still fires. The member is
reminded about something already done, until the app next opens and
reconciles.

None of it has run on a device. The Jest suite drives an in-memory double of
`expo-notifications`, which proves the decision logic and the reconciliation
and proves nothing about Android actually posting, scheduling or waking. This
is the general device gap in the accepted section below, but it lands harder
here than elsewhere: every other Android feature at least renders in a test
renderer, while notification delivery has no non-device evidence at all.

Closing it means either the push work in open decision 7, or a device pass.

### R10 — A collection past 1,000 rows cannot be shown

**Severity: low today, grows with history. Opened 2026-09-27.**

Each household collection is read in one request and refused with `TOO_LARGE`
above 1,000 rows, deliberately, rather than paged or truncated
(`docs/contract.md`). The likeliest to reach it is the unfiltered household
task read: it includes completed tasks in every open active list, so a
long-lived list such as a shopping list accumulates rows indefinitely. Today,
Tasks and the Tasks badge all read it (`features.md`), so past the limit both
screens show a "too many items" message and no data and the badge disappears,
on web and Android. List detail and Lists keep working, and Android
notifications still read My Tasks and Unassigned separately. Archiving old
lists is the only relief, and archiving is itself one-way (R2).

### R12 — Client sync and rendering costs are unmeasured on a device

**Severity: low. Opened 2026-09-28 by the mobile performance review.**

The review fixed the Android costs it could count: realtime hints fanning out
into one refetch per row (a twenty-task template copy cost 105 requests per
device, now 8), a fixed 3-second fallback poll (now 5 s backing off to 60 s),
a channel rejoin and up to two full reconciles on every return to the app (now
one), five keystore reads of the session before every request (now once per
process), a context re-render on every successful read (now at most once a
minute), every list row rendering again on any change (now only the rows whose
task changed, with one date formatter per locale), and reads that failed while
offline (now they wait for the network). What is left:

- **Nothing was measured on a phone.** The figures above are request and render
  counts from Jest, Vitest and a React Query simulation, not battery or radio
  time. Android Studio's energy and network profilers have not been run.
- **The web client still polls every 3 seconds** while its channel is down
  (`apps/web/src/app/useHouseholdRealtime.ts`). It shares the coalesced hints
  but not the backoff; the owner scoped the fix to Android.
- **Android lists are not virtualised.** Rows sit in a `ScrollView`, so opening
  a list near the 1,000-row ceiling (R10) still lays out every row once; a
  `FlatList` would only lay out what is on screen.
- **Web rows are not memoized** and web reads still go stale after 15 seconds;
  both matter less on a desktop and were left as they are.

### R13 — `npm audit` reports 66 advisories that SDK 57 cannot clear

**Severity: low. Opened 2026-10-11 by the dependency update.**

The update took every dependency to its newest release compatible with Expo
SDK 57 and cleared the critical `shell-quote` and high `source-map-js`
findings with in-range lockfile updates. The 66 left (16 moderate, 50 high)
come from five packages:

| Advisory               | Reached through                                  | Why it stays                                                           |
| ---------------------- | ------------------------------------------------ | ---------------------------------------------------------------------- |
| `braces` ≤3.0.3        | Jest 29 and Metro via `micromatch`               | No patched release exists; Jest 30 needs `jest-expo` 58                |
| `sprintf-js` ≤1.1.3    | Jest 29 coverage via `js-yaml` 3                 | No patched release exists                                              |
| `node-forge` ≤1.4.0    | `@expo/cli` code-signing certificates            | No patched release exists                                              |
| `uuid` <11.1.1         | `expo-splash-screen` iOS config plugin (`xcode`) | `xcode` requires `uuid` 7; the app does not build for iOS              |
| `decode-uri-component` | `expo-router` 57 via `query-string` 7            | The fix is outside `query-string` 7's range; `expo-router` 58 drops it |

All but the last run only on a developer machine or in CI. The last ships in
the APK: a crafted `odin://` link with deeply malformed percent-encoding could
stall URL parsing on the device that opens it. `npm audit fix` cannot help: its
"fix" downgrades Expo to SDK 44 and React Native to 0.72, so it fails with
`ERESOLVE`. Do not run it with `--force`.

**When to revisit.** Expo SDK 58 is still a pre-release (`next` tag, 58.0.7)
that pins React Native `0.88.0-rc.4`. npm rejects that release candidate
against the `react-native` peer ranges of Testing Library, Reanimated and
Worklets, so it only installs with `--legacy-peer-deps`, which
`code-standards.md` forbids. Upgrade when Expo tags SDK 58 as `latest` and React
Native 0.88.0 is final.

### R14 — Android APK build 3 predates the 2026-10-14 task housekeeping

**Severity: low. Opened 2026-10-14.**

The chronological tie-breaker, Delete done and household-unique avatar colours
reach the web on deploy but reach Android only with a new APK. Until then,
build 3 re-sorts the household read on the device with the old list-ID
tie-breaker, so undated tasks can appear in a different order on a phone than
on the web, and Android has no Delete done and can still show two members in
one colour. Nothing is lost or corrupted; the server order and data are the
same for both. Building and distributing APK build 4 closes it.

## Accepted, not tracked

These are real, known, and deliberately not being worked. They are here so
silence is not mistaken for "handled".

| Item                                                                     | Status                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Android device verification**                                          | **Deferred by owner decision, 2026-09-22.** No installed-device acceptance is recorded for this release. The 2026-10-14 signed APK passed EAS compilation, signature/manifest verification and automated checks, but that does not verify TalkBack, keyboard/date pickers, notifications or real-device behavior. What a device pass must cover is in `docs/verification.md`. Revisit before any release claim or store listing.                |
| **A new household starts with no templates**                             | **Intended, settled 2026-09-22.** Not a gap; see `docs/decisions.md` item 4.                                                                                                                                                                                                                                                                                                                                                                    |
| **One hosted environment**                                               | Deliberate for a private single-owner project. The operational hazard it creates is R4, which stays open.                                                                                                                                                                                                                                                                                                                                       |
| **R11 — The first task-workflow migration touches every list's version** | **Accepted by owner decision, 2026-09-27.** `20260927121823_task_workflow_polish.sql` backfills `lists.sort_order` with an `UPDATE` that fires `lists_touch_version`, so every existing list gains one version and an `updated_at` equal to the migration time. A list editor open during the migration reports one conflict, and `updated_at` stops meaning "last edited" for lists that predate it. The migration is not changed to avoid it. |
