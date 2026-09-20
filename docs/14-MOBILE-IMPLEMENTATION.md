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

## Owner decisions still required

These are proposals, not settled product scope (`docs/01-DECISIONS.md` item 5):

| Topic                | Proposed                       | Needs                                                                                                |
| -------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Package identifier   | `app.odin.household`           | Owner approval before any store listing or signed build                                              |
| Distribution         | Private APK first              | Owner choice; no keystore exists and none may be committed                                           |
| Invitation link base | `EXPO_PUBLIC_WEB_ORIGIN`       | Unset, links fall back to `odin://invite`, which is useless to a recipient without the app installed |
| Deep links           | `odin://invite#token=…` scheme | Verified Android App Links need a domain and `assetlinks.json`                                       |

The token is read only from the link fragment. A query parameter is deliberately
rejected so the contract's "keep tokens out of request paths" rule cannot be
undone by accident.

## Verified in this pass

Commands and results, run at the repository root unless noted:

- `npm run lint` — clean, zero warnings.
- `npm run typecheck` — clean across all workspaces.
- `npm run test` — 95 Vitest tests over 8 files (shared packages and web).
- `npm run test:mobile` — 38 Jest tests over 5 suites: environment contract,
  chunked secure storage, deep-link and redirect safety, `TaskRow` behaviour,
  and the bottom-navigation visibility rule.
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
3. Email OTP sign-in end to end. SMTP is still unconfigured, so no code can be
   received.
4. Deep-link redemption of a real invitation.
5. TalkBack traversal, dynamic font scaling, long Bulgarian labels and contrast
   on a device.
6. One Android client against one web client as two members of one household,
   including disconnect/reconnect.
7. Screen sizes, OS/API levels, build identifier and screenshots recorded per
   `docs/08-VERIFICATION.md`.

Native dependency changes require rebuilding the Android binary; deploying the
web app does not update an Android install.
