# Android UI acceptance — 2026-10-14

The owner approved `design-preview/odin-mobile-review.html` on 2026-10-13,
selected Android with the existing palette, and requested code, tests and
deployment. The approved behavior changes are recorded in `decisions.md` and
`features.md`.

## Implementation

- Shared household header, compact household counts, individual task cards,
  readable list/deadline/assignee lines and persistent tabs.
- Transactional Filters sheet with range validation, Reset/Cancel/Apply and
  applied-filter clearing; shared `@odin/domain` filtering remains authoritative.
- Title/list first for new tasks, expandable optional details/template controls,
  retained drafts and conflict handling; existing task editors open expanded.
- Lists retain template copying, menus and reordering. Settings retain profile,
  language, notifications, invitations and sign-out in clearer sections.
- Native safe-area and enlarged-text layout shared by tabs, FAB and quick add;
  narrow enlarged-text segments stack instead of overlapping.
- No API, schema, data rule, authorization, notification or web-layout change.

Expo Doctor required compatible SDK 57 patches: Expo 57.0.28, Crypto 57.0.4,
Router 57.0.26, Splash Screen 57.0.10 and jest-expo 57.0.6. React/React DOM remain
pinned to 19.2.3. npm's workspace resolution left a stale nested Router 57.0.25;
that generated directory and stale lock entry were removed, the lock regenerated,
and Doctor passed. Transitive Expo/Radix changes and deduplication explain the
lockfile movement. The existing audit count remains 66 (R13).

## Passed checks

| Command                                                                                             | Evidence                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                                                                     | Lint, formatting, all workspace typechecks, 12 tooling tests, 28 Vitest files / 244 tests, 21 native Jest suites / 142 tests, 4 build-environment tests passed; no checks suppressed.                    |
| `npm run doctor --workspace @odin/mobile`                                                           | 21/21 checks passed after compatibility repair.                                                                                                                                                          |
| `EXPO_NO_DOTENV=1 eas env:exec production 'npm run build:check' --non-interactive` in `apps/mobile` | Android export passed with verified production values; 1,938 modules, 27 assets, 5MB Hermes bundle before the final small segment-layout adjustment. EAS builds the final source again.                  |
| `npm run build`                                                                                     | Web production build passed with CI placeholder configuration, 611.70kB main JavaScript / 173.83kB gzip. Existing chunk warning remains R8; this was not a web deployment.                               |
| Production environment validation                                                                   | Hosted Odin URL and modern publishable key passed the existing validator without printing values. Missing public web origin was set to the documented Odin web origin and logged in `deployment-log.md`. |

Visual comparisons and browser limits are in `../design-preview/design-qa.md`.
The preview runtime's 28 protected files passed integrity validation; no template
runtime file was changed. The approved portable HTML remains a historical
proposal, separate from the production source.

## Failures encountered and resolved

- Sandboxed Node/esbuild subprocesses returned `spawn EPERM`; the same checks
  were rerun with process spawning allowed.
- Initial Doctor detected required patch versions, then duplicate/stale workspace
  dependencies. Corrected and rerun to 21/21; no exclusion was added.
- Windows CRLF checkout and one second formatting pass on the portable HTML
  initially failed Prettier. Normalized locally; unrelated source has no content
  diff and the full formatting gate passed.
- One cold integrated native test exceeded Jest's 5-second default once. The
  unchanged test passed on subsequent full runs; no timeout or assertion was
  weakened. CI must also pass before promotion.
- One filter test initially asserted a partial string as exact text; corrected
  it to the actual shared translation. Behavior and validation assertions remain.

## Release and remaining acceptance

Target: existing EAS project `89497d60-803b-4a7d-8583-dfd3903166a5`, package
`app.odin.household`, production profile/environment, internal APK distribution,
existing managed signing credentials. Release SHA, CI checks, build ID, version
and download link are appended to `deployment-log.md` after completion.

Completed: EAS build `361edb0a-e48c-4d98-9b78-e812eab303de`, version `0.1.0` /
code `3`, built source `78c71ae83dfbacfce42378a8a327c86aa47c1782`. The final native
build passed. The downloaded APK's signature verifies, its certificate matches
the prior APK, its manifest confirms the intended package/version and API
24–36 configuration, and it requests exactly the same permissions. Quality and
Database CI both passed for the source commit. See the deployment log for the
installation link, hashes, build evidence and rollback procedure.

No Android device is connected and no AVD is configured. Installed-device visual,
TalkBack, keyboard/date-picker, notification delivery, two-member production
acceptance and performance remain unverified. Existing accepted device deferral,
R9, R12 and other known risks remain open; an export or signed APK does not close
them. Store publication is not part of this private APK release.
