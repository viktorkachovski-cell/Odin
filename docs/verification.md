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

Locally the same set runs as `npm run check` plus `npm run build`. Current
counts at the latest release commit: 12 tooling tests, 18 Vitest files with 165
tests, 12 Android Jest suites with 93 tests, pgTAP planning 32 and 47
assertions, Expo Doctor 21/21 in CI, and a successful Android export and web
production build.

Two Expo Doctor checks — the config schema and the React Native Directory
lookup — fail in a sandbox without outbound network. That is an environment
limitation, not a project finding; CI reports 21/21.

## Requirements traceability

| Source IDs | Implementation owner    | Acceptance evidence required                                                                                          |
| ---------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| FR 01      | Database + both clients | Household A cannot read/write/subscribe to B through any exposed table/view/RPC; identity and counts isolated         |
| FR 02      | Shared + clients        | Display name and fallback avatar visible only to own household                                                        |
| FR 03–04   | Both clients            | Separate labeled sections, bordered templates and distinct active cards                                               |
| FR 05      | Database + clients      | Valid create succeeds once; blank rejected; cancel leaves nothing                                                     |
| FR 06–08   | Database + clients      | Atomic copy, unchanged source, fields/order copied, assignee/due/completion reset, same request twice yields one list |
| FR 09      | Both clients            | Card and direct link open correct authorized detail                                                                   |
| FR 10–13   | Database + clients      | Create/edit/single assign/reassign; inactive/foreign assignee rejected; peers have equal permissions                  |
| FR 14      | Database + clients      | One-action self-claim; simultaneous claims have exactly one winner                                                    |
| FR 15      | All                     | Optional task date/time works; no list deadline in UI, API or schema                                                  |
| FR 16–18   | All                     | Complete/reopen, 0% empty, correct rounding/count, incomplete group first and stable order                            |
| FR 19–20   | All                     | Cross-list filters correct after claim, reassignment, completion and removal of assignee; dated order/null-last       |
| FR 21–22   | Both clients            | Home navigation without mutation; down hides/up reveals bottom bar; desktop adaptation reviewed                       |
| FR 23–24   | All                     | Two actual sessions update within normal 5 seconds; stale edit is surfaced, drafts retained, reconnect recovers       |
| FR 25–26   | Both clients            | Every data screen has empty/loading/offline/retry/save-failure states, no silent draft loss                           |
| FR 27      | Both clients, optional  | Read-only preview with separate copy action; never blocks Must completion                                             |

BR 01–03 map to copy tests; BR 04 to active same-household assignment; BR 05/10 to full-list aggregates and completion tests; BR 06/07/09 to cross-list filters; BR 08 to incomplete-only overdue display. User-facing removal is deferred; any later removal must recalculate progress.

## Mandatory adversarial and edge cases

- [ ] Two households, two users in one household, anonymous user, expired session, deactivated member and forged foreign IDs.
- [ ] Direct table writes fail even if a user bypasses the UI; public/private command grants are tested.
- [ ] Reused request ID with altered payload fails; same ID after timeout/restart succeeds only once; receipt replay after membership loss reveals nothing.
- [ ] Copy failure halfway rolls back all rows and receipt; empty template works; duplicate legitimate copies with different IDs are allowed.
- [ ] Claim race, edit race, create order race, assignment versus membership revocation and simultaneous invite redemption use independent database connections.
- [ ] Stale fetch after successful mutation cannot restore older state; Realtime loss, reconnect and Android foreground resynchronize.
- [ ] Completed tasks disappear from cross-list views, remain in detail/totals, and never show overdue.
- [ ] Progress 0/0 = 0, 1/3 = 33, 2/3 = 67, 1/8 = 13 and all complete = 100.
- [ ] More than 50 tasks/lists paginate correctly; counts reflect all pages; no N+1 Home queries or silent row-limit truncation.
- [ ] Blank/whitespace-only title, max length, emoji/supplementary Unicode, Bulgarian, very long member/title labels, null subtitle/deadline/assignee.
- [ ] Same UTC due instant renders correctly in Europe/Sofia and another zone; DST invalid/ambiguous input handled explicitly; locale switching doesn't mutate instants.
- [ ] Invalid, expired, revoked and already-used invite; logged-out deep-link continuation; account already in another household; no token in logs/referrers.
- [ ] Email confirmation/recovery delivery, password-manager/autofill behavior, paste and session refresh on a real device.
- [ ] Sign out/account switch clears cached data/drafts/subscriptions; stale session cannot retrieve household records.
- [ ] Keyboard-only web, screen reader/TalkBack, focus recovery, contrast, 44x44 targets, Android large fonts and both translations.

## Performance evidence

Measure Home and List Detail usable-data time at the 75th percentile against the source target of 2 seconds on a documented typical mobile connection. Use at least 30 observations per scenario and report device, network profile, warm/cold cache and dataset (e.g. 20 lists/500 tasks). Track empty/loading UI separately from usable data. Measure accepted-write-to-other-client-visible time with two clients; target 5 seconds in normal connected conditions. Report sample size, worst case and failures; do not fabricate measurements.

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

No Android binary has been built or installed: this environment has no Android
SDK, emulator or device, and an export is not an installation. Deferred by
owner decision of 2026-09-22 and tracked in the accepted section of
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

## Completion report template

State implemented requirements, changed paths, test/build commands with exit status, environment/commit, manual/device evidence, unresolved issues and remaining risks. Separate “passed”, “failed” and “not run”. A plan, generated SQL file, lint pass or successful web deployment alone is not proof of a working product.
