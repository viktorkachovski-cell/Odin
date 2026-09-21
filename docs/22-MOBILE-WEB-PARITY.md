# Android and web feature parity

Recorded 2026-09-21 after auditing the production web routes against the Expo Android routes.

## Shared functions

Both clients use the same `@odin/data` commands and support email/password authentication, onboarding, household invitations, list creation/editing/deletion, task creation/editing/deletion, assignment/unassignment, claiming, completion/reopening, optional deadlines, shared notes, task templates, profile editing, English/Bulgarian selection and sign-out.

Email confirmation and password recovery intentionally finish in the deployed web client. Android opens the allowlisted production pages, then the member returns to the app and signs in. This keeps bearer-token handling out of a second native implementation.

## Android presentation

- Home and list detail use an extended floating action button for their primary create action.
- Task and list secondary actions use Android-style overflow controls and modal bottom menus instead of rows of desktop buttons.
- Task-template selection uses a scrollable bottom picker so long titles and growing template collections do not crowd the editor.
- List detail has an explicit in-app back control in addition to Android system back.
- Destructive actions still require the existing native confirmation alert.
- Completion and Claim stay directly reachable because they are the primary action for their respective task rows.
- Touch targets remain at least 48 dp, actions expose TalkBack labels, and English/Bulgarian text remains shared with web.

No database or API contract changed in this pass.

## Verification

- Root lint, formatting and TypeScript checks passed.
- Shared/web tests: 15 files and 133 tests passed.
- Android tests: 11 suites and 89 tests passed in-band.
- Tooling policy tests: 8 passed.
- Expo Doctor: 21/21 checks passed.
- Android production export: succeeded with a 4.8 MB Hermes bundle.

The app was not installed on an emulator or physical Android device on this machine. Native back behavior, TalkBack traversal, dynamic font scaling and the final visual layout still need a device check before calling this release device-verified.
