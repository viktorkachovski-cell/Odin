# Odin Android implementation

Implements `docs/04-MOBILE-AGENT.md`. The app lives in `apps/mobile` and shares
the contract, domain rules, translations, design tokens and data adapter with
the web client.

## Stack

| Choice           | Version         | Why                                                          |
| ---------------- | --------------- | ------------------------------------------------------------ |
| Expo SDK         | 57.0.24         | Current stable release                                       |
| React Native     | 0.86.3          | Prescribed by SDK 57                                         |
| React            | 19.2.3          | Prescribed by SDK 57                                         |
| Expo Router      | 57.0.22         | File-based routing, as the brief requires                    |
| Jest + jest-expo | 29.7.0 / 57.0.5 | React Native ships untranspiled source; Vitest cannot run it |

**The web client was moved from React 19.3.0 to 19.2.3 to match.** React Native's
renderer is built against one React version, so the app has to take the version
the SDK prescribes. Transitive `react: "*"` peers would otherwise install a
second, newer copy and hoist it above the app's own, which breaks hooks at
runtime. An `overrides` block in the root `package.json` pins one React for the
whole workspace; `npm ls react` shows a single copy. Web typecheck, its
component tests and its production build all pass on 19.2.3.

## What is shared rather than reimplemented

Three pieces moved into shared packages while building this client, because
duplicating them would let the two clients drift apart on rules the server
enforces:

- `useCommand` → `@odin/data`. It holds one request ID across an ambiguous
  `NETWORK` retry and mints a fresh one after any settled outcome. That is the
  client half of the idempotency contract, not presentation.
- `resolveDueInput` and `dueDraftFromIso` → `@odin/domain`. Both-or-neither
  deadline entry and the DST-gap rejection.
- `task.claim.short` / `task.edit_action.short` → `@odin/i18n`. The existing
  keys are accessible labels ("Claim {title}"); a compact button needs its own
  short text in both languages.

The read hooks in `src/state/queries.ts` are deliberately **not** shared: they
are per-app glue binding an app-specific context to the already-shared
repositories and query keys.

## Android specifics

- **Session storage.** `expo-secure-store` rejects values over 2048 bytes and a
  Supabase session routinely exceeds that, so `src/session-storage.ts` splits
  the value across numbered chunks behind a manifest. Chunk boundaries never
  split a surrogate pair, because a lone surrogate is replaced on the UTF-8
  round trip through the keystore and would corrupt the session. A partially
  written session reads back as absent rather than corrupt.
- **Foreground reconciliation.** `AppState` drives an authoritative membership
  refetch when Android returns the app to the foreground, so a revoked member
  cannot keep acting on cached household data.
- **Offline.** `@react-native-community/netinfo` drives the offline banner. A
  still-running reachability probe is not treated as offline.
- **Bottom navigation** hides on downward scroll and reveals on upward scroll,
  and stays visible at the top of the content, at the end of it, while a screen
  pins it, and when the system reduce-motion setting is on. That last case is an
  accessibility accommodation, recorded here for product review rather than
  applied silently.
- **`src/state/`, not `src/app/`.** Expo Router treats a `src/app` directory as
  the routes root, which silently captured the state modules until the export
  surfaced it.

## Email and password sign-in

Implements `docs/16-MOBILE-PASSWORD-AUTH-AGENT.md`. Android now registers and
signs in with the same Supabase accounts as the web client, through the shared
`registerWithPassword` / `signInWithPassword` / `requestPasswordReset` /
`resendConfirmation` wrappers in `@odin/data`. No authentication rule is
reimplemented here, and no schema change was needed.

- **Confirmation and recovery open the web pages**, not a native screen.
  `src/auth-urls.ts` holds the two allowlisted URLs as fixed constants, never
  derived from an email, an invitation, a route parameter or a preview
  deployment, because that input decides where a bearer token is delivered.
  After confirming or resetting in a browser the person returns to Odin and
  signs in; the two sessions stay independent, which is what makes this work
  when the mail is opened on another device. A native recovery deep link would
  need its own design and is explicitly out of scope.
- **No password policy on an existing account.** `validateNewPassword` guards
  registration only. An account created before the minimum length existed still
  signs in, so a migrating user is never locked out by a rule their password
  predates.
- **Existing one-time-code accounts migrate through Forgot password**, which
  keeps the same user, profile and household. Registering again would not, so
  the sign-in screen points at recovery rather than registration.
- **One in-flight request.** `useAuthRequest` holds a ref as well as disabling
  the button: two fast taps both run before React re-renders, and a second tap
  must never send a second confirmation email. Anything that sends mail also
  takes a 60-second visible cooldown, on top of the server's own limit.
- **The resend control is latched, not derived** from the live error. Starting a
  resend clears the error, which would otherwise take the resend button and its
  cooldown out of the tree mid-press. A test covers it because the first
  implementation had exactly that bug.
- **Identity changes clear the cache.** `OdinProvider` funnels every auth
  transition through one place that drops all household queries, drafts and
  subscriptions before publishing a different user, so one account cannot flash
  the previous account's household. A slow initial session lookup can no longer
  overwrite a newer auth event.
- **The pending invitation survives login** in `src/state/pending-invitation.ts`,
  in memory only. It is never written to SecureStore, a route parameter, the
  query cache or a log. Signing in to redeem keeps it; changing account or
  signing out discards it. Killing the app drops it, and the invite screen then
  asks the person to reopen the original invitation. Confirming an email never
  redeems an invitation or creates a household on its own.
- **`/verify-code` still resolves**, redirecting to sign-in, so an older build
  or a back-stack entry does not hit an unresolvable route. The OTP exports in
  `@odin/data` are left in place for builds still on the old flow.

## Owner decisions still required

These are proposals, not settled product scope (`docs/01-DECISIONS.md` item 5):

| Topic                | Proposed                       | Needs                                                                                                                                                                                          |
| -------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package identifier   | `app.odin.household`           | Owner approval before any store listing or signed build                                                                                                                                        |
| Distribution         | Private APK first              | Owner choice; no keystore exists and none may be committed                                                                                                                                     |
| Invitation link base | `EXPO_PUBLIC_WEB_ORIGIN`       | **Settled**: point it at the deployed web client, `https://odin-ten-tau.vercel.app`. Left unset, links fall back to `odin://invite`, which is useless to a recipient without the app installed |
| Deep links           | `odin://invite#token=…` scheme | Verified Android App Links need a domain and `assetlinks.json`                                                                                                                                 |

The token is read only from the link fragment. A query parameter is deliberately
rejected so the contract's "keep tokens out of request paths" rule cannot be
undone by accident.

## Build-time configuration

Odin runs a single hosted environment, treated as production (see
`docs/00-ARCHITECTURE.md`). An Android build therefore takes the same Supabase
project the web client uses:

```sh
EXPO_PUBLIC_SUPABASE_URL=https://mvltbhtsukorspmpyhpw.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key from the Supabase dashboard>
EXPO_PUBLIC_WEB_ORIGIN=https://odin-ten-tau.vercel.app
```

Expo inlines these at build time, so a binary carries whatever was set when it
was built. The publishable key is public by design -- it ships inside every
client bundle -- but it still belongs in the build environment, never in a
committed file. `apps/mobile/.env.example` holds the names and placeholders only.

## Verified in this pass

Commands and results, run at the repository root unless noted:

- `npm run lint` — clean, zero warnings.
- `npm run typecheck` — clean across all workspaces.
- `npm run test` — 124 Vitest tests over 10 files (shared packages and web).
- `npm run test:mobile` — 72 Jest tests over 8 suites: environment contract,
  chunked secure storage, deep-link and redirect safety (including the
  post-login destination rules), `TaskRow` behaviour, the bottom-navigation
  visibility rule, the three password screens, the auth-request guards, and
  provider identity handling.
- `npm run build` — web production build succeeds.
- `npm run build:check --workspace @odin/mobile` — Android export succeeds,
  producing a 4.7MB Hermes bundle from the full graph including every shared
  workspace package.
- `npx expo-doctor` (in `apps/mobile`) — cannot fully run in the build sandbox,
  which blocks the external services the config-schema and React Native
  Directory checks call. It is a CI step for exactly that reason, and on its
  first CI run it earned its place: it rejected `newArchEnabled` and
  `android.edgeToEdgeEnabled` in `app.json`. Both were removed from the Expo
  config schema by SDK 55+, where the new architecture and Android edge-to-edge
  are unconditional, so deleting the keys changes no behaviour. Neither appears
  in `@expo/config-types` for SDK 57.

## NOT verified — required before any release claim

No Android binary was built or installed, because this environment has no
Android SDK, emulator or device. An export is not an installation. Still
outstanding:

1. `npx expo run:android` or an EAS build, installed on a device/emulator.
2. Secure-store session persistence across app restarts, including token
   refresh and the chunked-value path, on real hardware.
3. Registration, email confirmation and password recovery end to end. SMTP is
   still unconfigured, so no confirmation or recovery mail can be delivered.
   Every test here mocks the auth calls and proves client-side behaviour
   only; none of them is evidence that mail arrives.
4. One account signing in on Android and on web with the same password, and an
   existing one-time-code account gaining a password through recovery with its
   user ID and household unchanged.
5. Deep-link redemption of a real invitation.
6. TalkBack traversal, password-manager autofill, paste, dynamic font scaling,
   long Bulgarian labels and contrast on a device.
7. One Android client against one web client as two members of one household,
   including disconnect/reconnect.
8. Screen sizes, OS/API levels, build identifier and screenshots recorded per
   `docs/08-VERIFICATION.md`.

Native dependency changes require rebuilding the Android binary; deploying the
web app does not update an Android install.
