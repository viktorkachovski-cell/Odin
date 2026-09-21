# Android email/password implementation and acceptance guide

Status: implemented in the Android client. Keep this document as the implementation boundary and acceptance checklist for future changes; do not rebuild the web authentication, database or business rules.

## Objective and fixed boundaries

Replace Android OTP entry with registration and password login using the same Supabase accounts as web. Existing OTP users must recover/set a password without losing their user ID, profile or household. Preserve one assignee, equal permissions, copy resets, task-only deadlines and household isolation.

For the first mobile password release, confirmation and password-reset emails open the existing HTTPS web pages. After confirming/resetting in a browser, the user returns to Android and signs in with the password. Browser and Android sessions are independent. This avoids new bearer-token deep links and works when email is opened on a different device. Native confirmation/recovery is optional follow-up scope, not required for this task.

## Read before editing

1. `AGENTS.md`, `docs/00-ARCHITECTURE.md`, `01-DECISIONS.md`, `02-CONTRACT.md`, `06-CODE-STANDARDS.md`.
2. `docs/14-MOBILE-IMPLEMENTATION.md`, `15-EMAIL-PASSWORD-AUTH.md` and this guide.
3. `apps/mobile/app/sign-in.tsx`, `verify-code.tsx`, `_layout.tsx`, `invite.tsx` and `onboarding.tsx`.
4. `apps/mobile/src/state/OdinProvider.tsx`, `AuthGate.tsx`, `OdinContext.ts`, `routing.ts`, `session-storage.ts` and existing mobile tests.
5. `packages/data/src/password-auth.ts`, `packages/domain/src/password.ts`, and `packages/i18n/src/en.ts`/`bg.ts`.

Inspect branch/status and preserve unrelated changes. Do not use Passport resources. No schema migration is needed.

## File plan

| File                                              | Work                                                                       |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| `apps/mobile/app/sign-in.tsx`                     | Replace request-code UI with email/password login                          |
| `apps/mobile/app/register.tsx`                    | Add registration, confirmation notice and resend                           |
| `apps/mobile/app/forgot-password.tsx`             | Add reset request and neutral inbox notice                                 |
| `apps/mobile/app/verify-code.tsx`                 | Stop navigating here; retain a safe redirect to sign-in for old routes     |
| `apps/mobile/src/components/Field.tsx`            | Reuse its input API; add only needed password accessibility/autofill props |
| `apps/mobile/src/state/OdinProvider.tsx`          | Clear query caches on identity change; preserve secure session adapter     |
| `apps/mobile/src/routing.ts` and invitation state | Keep validated internal destination and in-memory invitation through login |
| `apps/mobile/src/**` test files                   | Add Jest component/session/navigation coverage                             |
| `docs/14-MOBILE-IMPLEMENTATION.md`                | Record delivered scope and exact validation evidence                       |

Keep each module focused and below repository lint limits. Do not copy web DOM components into React Native.

## Exact shared APIs to use

Import from public `@odin/data` only:

```ts
registerWithPassword(client, email, password, confirmationUrl);
signInWithPassword(client, email, password);
resendConfirmation(client, email, confirmationUrl);
requestPasswordReset(client, email, recoveryUrl);
```

They return `CommandResult<T>`; inspect `result.ok` before accessing `data` or `error`. Password validation comes from `validateNewPassword` in `@odin/domain`. Use the existing `errorMessage` adapter with shared `auth.password.*` English/Bulgarian keys. Do not show raw Supabase errors.

Define one native auth-URL module with these public constants:

```ts
export const CONFIRMATION_URL = 'https://odin-ten-tau.vercel.app/auth/confirmed';
export const RECOVERY_URL = 'https://odin-ten-tau.vercel.app/reset-password';
```

These URLs are already allowlisted in Odin Supabase. Do not derive them from an email, invitation, route parameter, preview deployment URL or arbitrary deep link. Native still needs only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the approved Odin backend.

## Ordered implementation

1. Build the sign-in UI first: email, masked password, accessible show/hide, Sign in, Create account and Forgot password. Trim email only. Permit existing passwords shorter than the new-registration minimum. Use `autoCapitalize="none"`, disable autocorrect, appropriate email/password autofill and keyboard settings. Allow paste/password managers. Never place password in Expo route params, AsyncStorage, SecureStore or query cache.
2. Call `signInWithPassword`; prevent double-submit with an in-flight ref as well as a disabled button. Disable credentials while pending, preserve email, clear password when the request completes. Display generic wrong-credentials and network/rate-limit errors. For `auth.password.unconfirmed`, show a resend action with a 60-second cooldown. Keep offline actions disabled.
3. On successful login, replace the route with a validated internal destination; never push an external `next`. Reject sign-in/register/recovery route loops. Let the existing AuthGate handle profile and household onboarding. Query errors must show retry, not masquerade as a missing profile.
4. Build registration: email, password, confirmation; validate with shared helper before calling the API. When `confirmationRequired` is true, show inbox instructions, resend cooldown and a button back to password login. Tell the user to confirm in their browser, return to Odin and sign in. Duplicate registration receives the same safe notice; offer sign-in/reset. If a local configuration returns a session immediately, route normally. Do not disable hosted email confirmation.
5. Build Forgot password: email only; call the shared reset wrapper with `RECOVERY_URL`. Show the neutral existing-or-nonexistent account acknowledgement. Explain that the link sets the password in a browser; Android does not need a native reset form in this baseline. Existing OTP users follow exactly this route. Do not auto-register them again.
6. Keep `_layout.tsx` client creation and `createSecureSessionStorage` unchanged, with `detectSessionInUrl: false`. Preserve token refresh/AppState behavior. On account change/signout, clear household queries, drafts and subscriptions before displaying a different user's data. Prevent a slow initial session lookup from overwriting a newer auth event. Do not call asynchronous SDK methods inside an auth-event callback.
7. Preserve invitation flow. Strip/capture the invitation once, keep its token in memory across auth route unmounts, and clear it on successful redemption or explicit logout. Never pass it through `next`, persistent storage, logs or analytics. If Android is killed while the user confirms email, ask them to reopen the original invitation. Confirmation does not automatically redeem an invitation or create a household.
8. Add mobile-specific explanatory strings to both dictionaries without changing legacy OTP keys still used by old versions. Avoid rendering English literals in Bulgarian mode. Do not change task data language when the interface language changes.

## Required tests and acceptance

- New registration: short/mismatched password rejected locally; successful request clears passwords, shows confirmation instructions and prevents immediate resend.
- Existing confirmed user: correct password opens the same household in web and Android. Wrong password is generic. Existing short passwords still reach the server.
- Existing OTP account: request recovery, set password on web, log into Android; verify user ID and household are unchanged.
- Unconfirmed and duplicate registration: safe messages, resend works after cooldown. No account-existence disclosure from reset UI.
- Email confirmation on another device/browser: Android remains signed out until explicit password login, then succeeds.
- Invalid/expired recovery links: web recovery displays error, Android stays usable and can request a fresh link.
- Fast double taps and offline submit: at most one in-flight request, no hidden retries that resend mail.
- Password manager/autofill, paste, show/hide, TalkBack labels, keyboard avoidance, small Android screen and Bulgarian text all work.
- Authenticated app restart/refresh retains secure session; logout and cross-account changes cannot flash the previous household.
- Signed-out invitation survives login navigation. App restart safely asks to reopen the invitation. Used/expired/revoked invitations preserve existing handling.

Run from repository root and record actual results:

```sh
npm run lint
npm run format:check
npm run typecheck
npm run test:tooling
npm run test
npm run test:mobile
npm run build
npm run build:check --workspace @odin/mobile
```

Run `npx expo-doctor` from `apps/mobile`. Use the repository's existing CI and pinned Expo versions. Tests may mock auth for component behavior, but do not claim real delivery/device acceptance from mocks. Test a development/release Android build on a device or emulator; Expo Go alone is insufficient evidence for a release. Use controlled fixtures, never personal emails/passwords in tests or screenshots.

## Stop conditions and handoff

If SMTP still restricts mail, report that external dependency; keep code/test work moving and do not disable confirmation. Ask before changing account ownership, household rules, supported platforms or paid services. Do not delete users, reset hosted data, create custom password tables, add a service-role key to the app, or remove shared OTP exports during this migration.

Finish with changed files, exact commands/results, emulator/device evidence, verified cross-client behavior and any untested delivery steps. A native recovery deep-link enhancement would need a separate design covering verified Android app links, cold/warm start handling, token stripping/deduplication, recovery precedence, secure storage and expired-link tests. Do not put bearer auth tokens into the existing `odin://invite` handler.
