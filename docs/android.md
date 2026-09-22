# Odin Android implementation

The app lives in `apps/mobile` and shares the contract, domain rules,
translations, design tokens and data adapter with the web client. What the
app _does_ is `features.md`; this file is how Android does it.

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

Android registers and signs in with the same Supabase accounts as the web client, through the shared
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

## Presentation

Android adapts the presentation, never the rules. Shared commands, labels,
permissions and task behaviour stay aligned with the web client.

- Extended floating action buttons for the primary create action on Home and
  list detail.
- Secondary task and list actions use Android overflow controls and modal
  bottom menus rather than rows of desktop buttons.
- Task-template selection uses a scrollable bottom picker, so long titles and a
  growing template collection do not crowd the editor.
- List detail has an explicit in-app back control alongside Android system
  back.
- Destructive actions keep the native confirmation alert.
- Completion and Claim stay directly reachable: they are the primary action of
  their row.
- Template cards keep their border; active cards do not.
- A template's tasks are read-only — no completion, edit, delete or unassign
  control is rendered on them.
- Touch targets stay at least 48 dp, every control carries a TalkBack label,
  and English/Bulgarian text is shared with web.

## Lists, templates and notes on Android

| Action                     | Where it lives                                      | Command               |
| -------------------------- | --------------------------------------------------- | --------------------- |
| Save a list as a template  | Overflow on the Home card, and on list detail       | `save_list_template`  |
| Delete a list or template  | Overflow on the Home card, and on list detail       | `delete_list`         |
| Read a list's shared note  | Under the subtitle on the Home card and list detail | `get_home`/`get_list` |
| Write a list's shared note | Note field under the subtitle field in the editor   | `update_list_v2`      |

- `Save as list template` sits in the same `ActionMenu` that carries
  `Delete list`. It is not destructive, so it takes no confirmation alert — the
  new template card appearing on Home is the confirmation, backed by a polite
  live-region line. It invalidates Home only: the source list is unmodified and
  keeps its version.
- `Delete list` appears on template cards as well as active ones, with the same
  destructive alert and the same `expected_version` from the summary. The
  summary DTO already carries `version`, so deleting from Home needs no extra
  read.
- Saving a list writes **one list template** and never a task template, so the
  task editor's picker keeps reading `get_task_templates` alone.
- The list note is a `multiline` field with `numberOfLines={4}` under the
  subtitle field, validated with the shared `validateNotes`. An empty field
  submits `null`, never an empty string. `updateList` is called with `notes`,
  which routes to `update_list_v2`; omitting `notes` entirely would keep the
  legacy note-preserving `update_list`, a path that exists for installed builds
  rather than this one.

## Build-time configuration

Odin runs a single hosted environment, treated as production (see
`docs/architecture.md`). An Android build therefore takes the same Supabase
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

### EAS release rule

Every build from `main` must use the `production` EAS profile. `apps/mobile/eas.json`
maps the development, preview and production profiles to their same-named EAS
environments explicitly; do not remove those mappings or rely on a local `.env`
file, because ignored local files are not uploaded to EAS Build.

Before starting a release, confirm that the production environment contains
`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` with
`npx eas-cli@latest env:list --environment production`. Never paste a secret or
service-role key into an `EXPO_PUBLIC_` variable. The `eas-build-pre-install`
hook validates that both values target the hosted Odin project and fails the
remote build before dependency installation if they are missing or wrong.

## Owner decisions still required

These are proposals, not settled product scope (`docs/decisions.md` item 5):

| Topic                | Proposed                       | Needs                                                                                                                                                                                          |
| -------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package identifier   | `app.odin.household`           | Owner approval before any store listing or signed build                                                                                                                                        |
| Distribution         | Private APK first              | Owner choice; no keystore exists and none may be committed                                                                                                                                     |
| Invitation link base | `EXPO_PUBLIC_WEB_ORIGIN`       | **Settled**: point it at the deployed web client, `https://odin-ten-tau.vercel.app`. Left unset, links fall back to `odin://invite`, which is useless to a recipient without the app installed |
| Deep links           | `odin://invite#token=…` scheme | Verified Android App Links need a domain and `assetlinks.json`                                                                                                                                 |

The token is read only from the link fragment. A query parameter is deliberately
rejected so the contract's "keep tokens out of request paths" rule cannot be
undone by accident.

## Device verification

Nothing in the Android client has been exercised on an emulator or a physical
device: this environment has no Android SDK, emulator or device, and an export
is not an installation. Everything Android is proven by Jest, typecheck, Expo
Doctor and a production export only.

Device verification is **deferred by owner decision of 2026-09-22** and is not
tracked as an open risk; see the accepted section of `known-risks.md`. The gap
is real, so revisit it before any release claim or store listing. What a device
pass would have to cover is listed in `verification.md`.

Native dependency changes require rebuilding the Android binary. Deploying the
web app does not update an Android install.
