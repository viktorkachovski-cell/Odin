# Android implementation agent

## Mission and prerequisites

Build the functional Android application using Expo React Native and TypeScript. Read architecture, decisions, contract, code standards and verification docs first. Use a stable database contract and generated types. Mocked UI work may begin before the backend exists, but mocked data does not satisfy integration acceptance.

Own `apps/mobile/**`, Android-specific adapters/tests and native release notes. Coordinate shared `packages/data`, `domain` and `i18n` edits through one shared-package owner; do not create a mobile-only competing API.

## Bootstrap

1. Choose a supported Expo SDK and use the matching Expo-prescribed React/React Native versions; commit exact versions and root lockfile. Record package ID and distribution mode as owner decisions if unset.
2. Use Expo Router. Suggested routes: sign-in, verify-code, onboarding, invite, Home, list/[id], unassigned, my-tasks, settings. Editor sheets are navigable/dismissible without committing partial data.
3. Extend the root TypeScript strict settings and Expo's platform base config. Add scripts `typecheck`, `test`, `test:integration`, `build:check` in the workspace. Wire required scripts into CI; no empty test commands.
4. Inject native session storage, AppState and network adapters into the shared data layer. Validate the chosen secure-storage session implementation on a real Android device, including refresh and token-size failure handling.

## Screen-by-screen acceptance

| Screen           | Required implementation                                                                                                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in/OTP      | Localized email input, submit/resend cooldown, code entry with paste/autofill where supported, invalid/expired code, network failure, retry and sign-out; never log code/email/token                  |
| Onboarding       | Display-name setup; create household or redeem invitation; language/seed-language selection; existing membership cannot be overwritten by a link                                                      |
| Home             | Clearly labeled Templates and Active Lists; border only on template cards; title/subtitle; independent accessible copy control; create-list action; progress summaries and empty/loading/error states |
| Create/edit list | Required title, optional subtitle, save/cancel; no deadline; retain typed text on failure; `expected_version` for edits                                                                               |
| List detail      | Header, progress, add-task action; incomplete first then complete, preserving task order in each group; completion control independent from row editor press                                          |
| Task editor      | Title, zero/one active member, optional explicit local date/time; clear assignee/deadline controls; preserve draft on conflict and let user review latest state                                       |
| Unassigned       | Incomplete unassigned tasks across open active lists; parent list and deadline; one-tap Claim; no optimism that claims success before server confirmation                                             |
| My Tasks         | Incomplete assigned-to-me tasks; due order with undated last; complete directly and remove after success; parent-list navigation                                                                      |
| Settings         | English/Bulgarian selection, own display name, members, invitation creation, sign out; no invented admin/delete/expel controls                                                                        |

FR 27 read-only template preview is optional; implement only after all Must scenarios pass. Tapping Copy must never accidentally trigger preview as well.

## Navigation and accessibility

Keep the required question-mark and person icons but label them “Unassigned” and “My Tasks” in each language. Home/create/add actions are context-sensitive as documented, never ambiguous destructive controls. Bottom navigation hides on downward scroll and reveals on upward scroll; keep it visible at top/end of content, when focus enters navigation, while a form requires it, and in accessibility/reduced-motion modes if approved as an accessibility accommodation. Document such exceptions for product review; do not silently replace the source behavior.

Use safe-area insets, Android back behavior and keyboard avoidance. Touch targets at least 44x44 logical units (prefer 48 on Android); verify TalkBack semantics, checkbox state, dynamic font scaling, long Bulgarian labels, contrast and focus traversal. Never use color or an avatar alone as the assignee/status indicator.

## Shared state and conflicts

Use the public data adapter. A command retains its UUID while pending and through ambiguous retries. Disable duplicate submit while pending; server idempotency remains mandatory. Completion can update optimistically only with rollback and version-aware reconciliation. Reassignment/claim/copy should display pending and await authoritative confirmation.

On `CONFLICT`, keep user edits, show “This task changed”, refresh the latest task and offer Review/Cancel. Reapply only after explicit user intent, a fresh version and a new request ID. Do not silently overwrite another member's fields. Return-from-background refresh must not erase editor drafts.

Realtime invalidates shared queries; remove subscriptions on household/session changes. Show offline/stale banners with last successful sync time. No background write queue. Sign-out clears all household caches and operation envelopes.

## English and Bulgarian

All interface text comes from shared translation keys, including validation, empty states, error codes, accessibility labels and date helpers. Use Intl or a verified supported equivalent for locale-aware time/pluralization; test Bulgarian glyph rendering. Changing UI language must not translate user-entered list/task text. Offer explicit language selection; initial device locale may choose the default. Persist own preference.

Date picker uses device time zone, sends ISO UTC, and displays local time. Show timezone when ambiguity matters. Verify DST gaps/repeated times; request explicit adjustment instead of silently moving an invalid time. Past incomplete tasks say “Overdue”; completed tasks never do.

## Verification and release handoff

Add React Native Testing Library behavior tests and device-level tests for core flows. Run lint, typecheck, domain tests, mobile tests, Expo Doctor, Android bundle/export and a development build on emulator/device. An export alone does not prove installation, deep links, email flow or secure session persistence. Test one Android client against one web client as two household members, including disconnect/reconnect.

Record screen sizes, OS/API level, build identifier, commands, passed/failed scenarios and screenshots where useful. Provide signed test APK only once signing/distribution is decided; never commit keystores. Native dependency changes require rebuilding the Android binary. Do not claim production release after Expo Go-only verification.

Suggested agent prompt: “Implement `docs/04-MOBILE-AGENT.md` against the shared contract and database. Deliver Android behavior in English and Bulgarian, test real two-user synchronization and failure recovery, and record unresolved release prerequisites without inventing product rules.”
