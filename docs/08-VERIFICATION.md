# Verification and release checklist

Unchecked items below are remaining release/device evidence, not a statement
that the application is unimplemented. Current automated evidence is in
`11-TOOLING-VALIDATION.md`, `17-MOBILE-QA.md` and `22-MOBILE-WEB-PARITY.md`.

## Current implementation status — 2026-09-21

The web and Android clients, shared data adapter, task notes/templates and
production Supabase migrations are implemented. GitHub Quality passed for
commit `8c74b84`; Vercel production deployment completed successfully. The
remaining unchecked items are hosted email delivery, physical Android/device
checks, two-client manual synchronization and performance measurements.

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
- [ ] Proposed invitation/onboarding defaults, seed translations and membership/account lifecycle reviewed.
- [x] Single Odin production environment selected; a separate staging project is intentionally out of scope for this hobby project.
- [x] Workspace lint/typecheck/tests/builds and database checks pass on CI at the current release commit.
- [ ] Database backup/restore strategy is rehearsed against disposable data without resetting production.
- [x] Production keys and Auth redirects are configured; no secret appears in browser/Android bundles.
- [ ] Android install, web nested-route refresh, app/invite links and two-client sync pass on production with controlled test accounts.
- [ ] Product owner reviews UI against original sketches and approves documented adaptations.
- [ ] Record release SHA, migration IDs, deployment URL/build ID, tests and rollback procedure; then promote approved production artifacts.

## Completion report template

State implemented requirements, changed paths, test/build commands with exit status, environment/commit, manual/device evidence, unresolved issues and remaining risks. Separate “passed”, “failed” and “not run”. A plan, generated SQL file, lint pass or successful web deployment alone is not proof of a working product.
