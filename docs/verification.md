# Verification

What is proven, how, and what is still unproven. Unchecked boxes are missing
_evidence_, not missing implementation — the application is built and
deployed.

## Proven on every push

The `Quality` workflow runs lint and formatting, typecheck, tooling tests,
shared and web tests, the web production build, and the Android job (Jest,
Expo Doctor, Android export). The `Database` workflow starts a disposable
Supabase stack and runs `supabase db lint` with warnings failing the job, the
pgTAP suites and the parallel-transaction concurrency suite.

Locally the same set runs as `npm run check` plus `npm run build`. Counts on
2026-10-14: 12 tooling tests, 28 Vitest files with 245 tests, 21 Android Jest
suites with 142 tests, 4 mobile build-environment tests, pgTAP planning 32, 47
and 50 assertions (129), five parallel-transaction cases, Expo Doctor 21/21 in
CI, and a successful Android export and web production build.

Two Expo Doctor checks — the config schema and the React Native Directory
lookup — fail in a sandbox without outbound network. That is an environment
limitation, not a project finding; CI reports 21/21.

## Multiple-assignee evidence — 2026-11-04

Branch `vikc/peaceful-newton-y14ldu`. **Automated evidence only, from a
sandbox with no Docker image access, no device and no browser session. Nothing
here is real-device acceptance.** The hosted apply of 2026-11-05 and its
checks are in `deployment-log.md`; they are database checks, not client
acceptance.

Environment: Linux, Node 22.23.4, npm 10.9.9. The Supabase images could not be
pulled (`supabase start` failed with HTTP 403 from the registry proxy), so the
database gates ran on a **disposable PostgreSQL 16.15 with a small Supabase
shim** (`anon`/`authenticated` roles, `auth.users`, `auth.uid()`, the
`extensions` schema, a `supabase_realtime` publication) and pgTAP 1.3.2 from
apt. The project pins PostgreSQL 17 (`config.toml`), and the shim is not
GoTrue or PostgREST, so it proves SQL behaviour and not the exposed API.

| Check                                                                                                       | Result                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci --ignore-scripts`                                                                                   | passed                                                                                                                                                                                                                                                                                                                                               |
| `npm run check` (lint with zero warnings, Prettier, every workspace typecheck, tooling tests, Vitest, Jest) | exit 0: 16 tooling tests, 32 Vitest files with 315 tests, 22 Jest suites with 176 tests                                                                                                                                                                                                                                                              |
| `npm run build` (web, placeholder Supabase values)                                                          | passed, 619.61 kB JavaScript (175.73 kB gzip), the existing chunk-size warning (R8)                                                                                                                                                                                                                                                                  |
| `npx expo-doctor` in `apps/mobile`                                                                          | 19/21. The config-schema and React Native Directory checks need the network and fail here as they do in any offline sandbox (see above); CI reports 21/21                                                                                                                                                                                            |
| `npm run build:check` in `apps/mobile` (Android export)                                                     | passed, one Android Hermes bundle                                                                                                                                                                                                                                                                                                                    |
| Replay of all 13 migrations into an empty database                                                          | passed. The existing `MAINTAIN` grants (PostgreSQL 17 syntax) were stripped for the 16 server only                                                                                                                                                                                                                                                   |
| Replay of the declarative schemas into an empty database                                                    | passed. `pg_dump -s` of it against the migration-built one differs only in the column order of three columns added by earlier `ALTER TABLE`s and in shim-only `service_role` grants, i.e. no drift from this change                                                                                                                                  |
| pgTAP `001`–`005`                                                                                           | 32, 47, 50, 36 and 103 assertions (268), all passing on both the migrated and the declarative database. `005_multiple_assignees.sql` is new                                                                                                                                                                                                          |
| `node supabase/tests/concurrency.mjs`                                                                       | passed on every run (nine across the work, three on the final schema) against the migrated database; 12 scenarios, 7 of them new (concurrent additions, duplicate assignment, add with remove, editor replacement race, stale clear, assignment racing revocation in both orders)                                                                    |
| `supabase/smoke/*.sql` (all seven plus the new `multiple-assignees-smoke.sql`)                              | each reports `passed` on the migrated and the declarative database                                                                                                                                                                                                                                                                                   |
| Migration rehearsal on legacy data (`multiple-assignees-migration-check.sql`)                               | a database at the previous migration seeded with assigned, unassigned, done, blocked, template, archived-list and departed-member tasks: the `tasks` fingerprint was identical before and after (no version or timestamp moved), and all 5 assignments, including the archived-list and departed-member ones, were copied with none missing or extra |

**Not run, and why.** `supabase start`, `supabase db lint --fail-on warning`,
`supabase test db` and `supabase gen types` need the Supabase containers, so
CI's `Database` workflow is the first place they will run. The
generated-types file `packages/contracts/src/database.generated.ts` was
therefore **edited by hand** to the generator's format (one table, six
functions); regenerate it before release and treat any diff as authoritative
(`operations.md`). The two Realtime-over-the-network and PostgREST behaviours —
a second client receiving the hint, a composite-key embed — were not exercised;
the new task read deliberately avoids an embed (`get_task_v2` is an RPC) for that
reason. Browser rendering, two-client synchronisation, keyboard and screen-reader
use of the pickers, large text and Bulgarian layout were checked only by
component tests (`AssigneePicker`, `TaskRow`, `TaskEditor`,
`TaskDetailsFlow`), and Android notification delivery only against the in-memory
`expo-notifications` double (R9).

A pre-existing observation, not changed here: the original
`concurrency.mjs` fails its final `cleanFixtures` (deleting a household that
holds an assigned task) on a **declaratively built** database, because the
cascade reaches `memberships` before `tasks` and `tasks_assignee_membership_fk`
is `NO ACTION`. CI builds from migrations, where the order happens to work, and
the new `task_assignees` foreign key cascades so it adds no new instance.

## Projects evidence — 2026-11-09

Branch `VikC/odin-project-space-lists-2ef9a9`, a **draft for review**.
**Automated evidence only: no device, no browser session, and nothing applied
to the hosted project** (the migration waits for review; nothing is appended to
`deployment-log.md`). Nothing here is real-device acceptance.

Environment: Windows 10, Node 22.23.3, npm 10.9.9, Docker 29.8.1. `supabase
start` (CLI 2.120.0) pulled its images but failed twice at its own database
connection step (`DbConnectError`: "Connection terminated unexpectedly", then
"read ECONNRESET"), so the database gates ran against a disposable container of
the project's own image, `public.ecr.aws/supabase/postgres:17.6.1.165`
(PostgreSQL 17, matching `config.toml`), with one shim: the image's
`auth.users` lacks GoTrue's later `email_confirmed_at` column, which the
existing fixtures insert, so it was added. There was no GoTrue, PostgREST or
Realtime, so this proves SQL behaviour and not the exposed API. Migrations were
applied one file at a time with `psql -1 -v ON_ERROR_STOP=1`; pgTAP files ran
through `psql` rather than `pg_prove`.

| Check                                                                 | Result                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| All 14 migrations replay in order, ending with `20261109120000`       | applied, no error                                                                                                                                                                                                                                                                                             |
| pgTAP `001`–`006`                                                     | 32 + 47 + 50 + 36 + 103 + 59 = 327 assertions, all `ok` (`006_projects.sql` is new: 59)                                                                                                                                                                                                                       |
| `node supabase/tests/concurrency.mjs`                                 | passed, including the two new cases: a project delete racing a move into it (12 rounds) and simultaneous moves in a project                                                                                                                                                                                   |
| `supabase db lint --db-url … --level warning --fail-on warning`       | "No schema errors found"                                                                                                                                                                                                                                                                                      |
| Declarative `schemas/` replayed into a second container vs migrations | 121 functions byte-identical after whitespace folding; tables, columns, indexes, constraints, triggers, policies and table grants identical. Only difference: `anon` execute grants on older functions (`claim_task`, `create_list`, …), a pre-existing artefact of the old migrations, unrelated to projects |
| `npm run typecheck` (7 workspaces), `npm run lint`                    | clean, zero warnings                                                                                                                                                                                                                                                                                          |
| `npx vitest run`                                                      | 35 files, 357 tests passed                                                                                                                                                                                                                                                                                    |
| `npm run test:mobile`                                                 | 23 suites, 193 tests passed                                                                                                                                                                                                                                                                                   |
| `npm run test:tooling`                                                | 18 passed                                                                                                                                                                                                                                                                                                     |
| `npm run build` (placeholder `VITE_*` values)                         | built                                                                                                                                                                                                                                                                                                         |
| `npm run build:check --workspace @odin/mobile` (placeholder env)      | Android bundle exported                                                                                                                                                                                                                                                                                       |

Review fix (reorder before projects load): Reorder on the Active tab now waits
for the projects read (`canReorderLists` in `@odin/domain`, used by both
clients). New screen tests `apps/web/src/routes/lists-reorder.test.tsx` and
`apps/mobile/src/components/ListsScreen.test.tsx` (4 each) fail on the previous
screens (2 of 4 each) and pass on the fix. After it: typecheck and lint clean,
`npx vitest run` 36 files / 361 tests, mobile jest 24 suites / 197 tests.

`prettier --check` was run on the changed files only: this Windows checkout has
CRLF line endings on files the change does not touch, so `npm run format:check`
reports unrelated files here and was not used as the gate.

Not done: `expo-doctor`, any run against the hosted project, any real-device or
browser check of the grouped Lists screen, and `supabase gen types` — the
installed CLI emits a differently shaped file than the committed one, so
`database.generated.ts` was extended by hand for the new table, column and six
functions in the committed style, and `tsc` accepts it. The release order and
the installed-Android behaviour are in `contract.md` and risk R16.

## Task-workflow evidence — 2026-09-27

Review-fix commit `69197cc` passed GitHub [Quality](https://github.com/viktorkachovski-cell/Odin/actions/runs/36332210138)
and [Database](https://github.com/viktorkachovski-cell/Odin/actions/runs/36332210226),
including all three pgTAP files and the five parallel cases; the review had
reproduced the neighbour-delete race as a not-null `sort_order` failure before
the parent-list lock fixed it. The hosted dry run, apply and smoke run are in
`deployment-log.md`. Nobody has yet checked two-client movement/state
synchronization, deadline filters around local midnight and DST, or
phone/tablet visual fit, on a device or in a browser.

## Requirements traceability

| Source IDs                        | Implementation owner     | Acceptance evidence required                                                                                                                                                                  |
| --------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR 01                             | Database + both clients  | Household A cannot read/write/subscribe to B through any exposed table/view/RPC; identity and counts isolated                                                                                 |
| FR 02                             | Shared + clients         | Display name and fallback avatar visible only to own household                                                                                                                                |
| FR 03–04 (amended 2026-10-11)     | Both clients             | Lists has separate Active and Templates tabs; a template is visibly a template and used through Use template                                                                                  |
| FR 05                             | Database + clients       | Valid create succeeds once; blank rejected; cancel leaves nothing                                                                                                                             |
| FR 06–08                          | Database + clients       | Atomic copy, unchanged source, fields/order copied, assignee/due/completion reset, same request twice yields one list                                                                         |
| FR 09                             | Both clients             | List row and direct link open correct authorized detail                                                                                                                                       |
| FR 10–13 (amended 2026-11-04)     | Database + clients       | Create/edit with zero, one or several assignees; add/remove/replace/clear; inactive/unknown/foreign assignee rejected atomically; peers have equal permissions (`005_multiple_assignees.sql`) |
| FR 14 (amended 2026-11-04)        | Database + clients       | One-action Assign to me that keeps existing assignees; legacy claim has exactly one winner; concurrent additions all survive                                                                  |
| FR 15                             | All                      | Optional task date/time works; no list deadline in UI, API or schema                                                                                                                          |
| FR 16–18                          | All                      | Complete/reopen, 0% empty, correct rounding/count, incomplete group first and stable order                                                                                                    |
| FR 19–20 (amended 2026-11-04)     | All                      | Cross-list filters correct after adding, removing and clearing assignees, completion and reopening; a shared task is once in each assignee's Mine and once in Everyone; dated order/null-last |
| FR 21–22 (amended 2026-10-11)     | Both clients             | Today/Tasks/Lists/Settings navigation without mutation; down hides/up reveals bottom bar; desktop adaptation reviewed                                                                         |
| FR 23–24                          | All                      | Two actual sessions update within normal 5 seconds; stale edit is surfaced, drafts retained, reconnect recovers                                                                               |
| FR 25–26                          | Both clients             | Every data screen has empty/loading/offline/retry/save-failure states, no silent draft loss                                                                                                   |
| FR 27 (superseded 2026-10-14)     | All                      | Templates open and edit with a separate copy action; `004_editable_templates.sql` pins the server rules, client tests the text-only editor and row targets                                    |
| Notification amendment 2026-09-22 | Android + `@odin/domain` | Assignment, update and 24h/4h/1h deadline notifications fire under both gates and only then; scheduled set matches current deadlines; **delivery itself is unproven — risk R9**               |

BR 01–03 map to copy tests; BR 04 to active same-household assignment; BR 05/10 to full-list aggregates and completion tests; BR 06/07/09 to cross-list filters; BR 08 to incomplete-only overdue display. Task deletion and list archival are implemented; restoration and purge remain open under R2.

## Mandatory adversarial and edge cases

- [ ] Two households, two users in one household, anonymous user, expired session, deactivated member and forged foreign IDs.
- [ ] Direct table writes fail even if a user bypasses the UI; public/private command grants are tested.
- [ ] Reused request ID with altered payload fails; same ID after timeout/restart succeeds only once; receipt replay after membership loss reveals nothing.
- [ ] Copy failure halfway rolls back all rows and receipt; empty template works; duplicate legitimate copies with different IDs are allowed.
- [ ] Claim race, edit race, create order race, assignment versus membership revocation and simultaneous invite redemption use independent database connections. (Claim, edit, create-order and assignment-versus-revocation, both orders, do; invite redemption still does not — R3.)
- [ ] Stale fetch after successful mutation cannot restore older state; Realtime loss, reconnect and Android foreground resynchronize.
- [ ] Completed tasks disappear from cross-list views, remain in detail/totals, and never show overdue.
- [ ] Progress 0/0 = 0, 1/3 = 33, 2/3 = 67, 1/8 = 13 and all complete = 100.
- [ ] Current snapshot readers return complete lists through 1,000 rows and a visible `TOO_LARGE` above it; installed clients' 50-row paged readers remain correct; counts cover all tasks and Lists has no N+1 reads.
- [ ] Blank/whitespace-only title, max length, emoji/supplementary Unicode, Bulgarian, very long member/title labels, null subtitle/deadline/assignee.
- [ ] Same UTC due instant renders correctly in Europe/Sofia and another zone; DST invalid/ambiguous input handled explicitly; locale switching doesn't mutate instants.
- [ ] Invalid, expired, revoked and already-used invite; logged-out deep-link continuation; account already in another household; no token in logs/referrers.
- [ ] Email confirmation/recovery delivery, password-manager/autofill behavior, paste and session refresh on a real device.
- [ ] Sign out/account switch clears cached data/drafts/subscriptions; stale session cannot retrieve household records.
- [ ] Keyboard-only web, screen reader/TalkBack, focus recovery, contrast, 44x44 targets, Android large fonts and both translations.
- [x] Notification decisions: silent baseline on first read, foreground
      silence, no replay of a change that was silent, burst collapsed to a
      summary, stage already past skipped, reminder reconciled on deadline
      change/removal/task leaving, re-worded on language change, nothing at all
      when either gate is off. Covered by 14 Vitest and 13 Jest cases against an
      in-memory `expo-notifications` double, plus (2026-11-04) shared-task cases:
      each assignee's device announces the one task once, someone joining a task
      of mine counts as a change, a listed task that no longer names me is
      ignored, a task in both reads yields one set of reminders, reminders are
      kept across Mine ⇄ Unassigned and dropped when I am removed or anyone
      completes it, and a moved deadline reschedules them.
- [ ] Notification **delivery** on a device: Android actually posting an
      announcement, an alarm surviving app kill and reboot, Doze delay measured
      against the 1-hour stage, the Android 13+ permission prompt, and
      "don't ask again" reaching the blocked state in Settings.

## Performance evidence

Measure Today, Lists and List Detail usable-data time at the 75th percentile against the source target of 2 seconds on a documented typical mobile connection. Use at least 30 observations per scenario and report device, network profile, warm/cold cache and dataset (e.g. 20 lists/500 tasks). Track empty/loading UI separately from usable data. Measure accepted-write-to-other-client-visible time with two clients; target 5 seconds in normal connected conditions. Report sample size, worst case and failures; do not fabricate measurements.

## Release gates

- [ ] Exact platform/browser matrix and distribution/signing owner chosen.
- [ ] Proposed invitation and onboarding defaults, and the membership/account
      lifecycle, reviewed. Seed translations are no longer a gate: a household
      starting with no templates is intended (`decisions.md` item 4).
- [x] Single Odin production environment selected; a separate staging project
      is intentionally out of scope for this hobby project.
- [x] Workspace lint, typecheck, tests, builds and database checks pass in CI
      at the current release commit.
- [ ] Database backup/restore strategy rehearsed against disposable data
      without resetting production.
- [x] Production keys and Auth redirects configured; no secret appears in a
      browser or Android bundle.
- [ ] Hosted email delivery works. Custom SMTP is unconfigured, so confirmation
      and recovery mail cannot reach a general recipient — risk R1 in
      `known-risks.md`, and the one gate that blocks a real member today.
- [ ] Android install, web nested-route refresh, app/invite links and
      two-client sync pass on production with controlled test accounts.
- [ ] Product owner reviews the UI against the original sketches and approves
      the documented adaptations. Review at narrow phone width, large Android
      font, tablet and desktop, in both languages, covering long titles and
      initials and the empty, busy, offline, conflict and success states.
- [ ] Record release SHA, migration IDs, deployment URL/build ID, tests and
      rollback procedure, then promote approved production artifacts.

## Device verification — deferred

The 2026-10-14 release has a signed EAS APK with independent signature, manifest
and permission verification, recorded in `deployment-log.md`. Android SDK tools
are available, but no device is connected and no AVD is configured. No installed
acceptance is recorded for this release; an APK is not a device test. Deferred
by owner decision of 2026-09-22 and tracked in the accepted section of
`known-risks.md` rather than as an open risk. A device pass would have to cover:

1. `npx expo run:android` or an EAS build, installed on a device or emulator.
2. Secure-store session persistence across restarts, including token refresh
   and the chunked-value path, on real hardware.
3. Registration, confirmation and recovery end to end in a real inbox. Every
   automated test here mocks the auth call and proves client behaviour only.
4. One account signing in on Android and web with the same password, and an
   existing one-time-code account gaining a password through recovery with its
   user ID and household unchanged.
5. Deep-link redemption of a real invitation.
6. TalkBack traversal, password-manager autofill, paste, dynamic font scaling,
   long Bulgarian labels and contrast.
7. One Android client against one web client as two members of one household,
   including disconnect and reconnect.
8. Screen sizes, OS/API levels, build identifier and screenshots recorded.
9. Notifications end to end: permission prompt and refusal, an announcement
   arriving with the app backgrounded, a deadline reminder arriving with the
   app closed and after a reboot, the mute switch silencing both, and sign-out
   leaving no scheduled reminder behind. The suite mocks the native module
   entirely, so none of this has any non-device evidence — risk R9.
10. Sync cost in Android Studio's network profiler: one refetch round on each
    return to the app, one or two for a template copy by another member, and
    the fallback poll slowing to once a minute while realtime is blocked but
    the network is up, and a cold start in airplane mode showing the offline
    message and loading on reconnect — risk R12.

## Completion report template

State implemented requirements, changed paths, test/build commands with exit status, environment/commit, manual/device evidence, unresolved issues and remaining risks. Separate “passed”, “failed” and “not run”. A plan, generated SQL file, lint pass or successful web deployment alone is not proof of a working product.
