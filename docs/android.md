# Odin Android implementation

The app lives in `apps/mobile` and shares the contract, domain rules,
translations, design tokens and data adapter with the web client. What the
app _does_ is `features.md`; this file is how Android does it.

## Stack

| Choice           | Version         | Why                                                          |
| ---------------- | --------------- | ------------------------------------------------------------ |
| Expo SDK         | 57.0.28         | SDK 57 patch required by Expo Doctor                         |
| React Native     | 0.86.3          | Prescribed by SDK 57                                         |
| React            | 19.2.3          | Prescribed by SDK 57                                         |
| Expo Router      | 57.0.25         | File-based routing, as the brief requires                    |
| Jest + jest-expo | 29.7.0 / 57.0.6 | React Native ships untranspiled source; Vitest cannot run it |

React Native's renderer is built against one React version, so the whole
workspace, web included, takes the version the SDK prescribes through the root
`overrides` block (`architecture.md`); `npm ls react` shows a single copy.

## What is shared rather than reimplemented

Cross-platform rules and actions live in shared packages so the clients use
the same behaviour:

- `useCommand`, `useTaskRowActions` and `useListActions` → `@odin/data`.
  `useCommand` holds one request ID across an ambiguous `NETWORK` retry and
  mints a fresh one after any settled outcome, the client half of the
  idempotency contract; the other two wire every row and list command with
  its invalidation set.
- `resolveDueInput` and `dueDraftFromIso` → `@odin/domain`. Both-or-neither
  deadline entry and the DST-gap rejection.
- `filterTasks`, `groupTasksByDeadline`, `groupMyTasksForToday`,
  `summarizeTasks`, `taskRowActions`, `taskState`, `taskStatusOptions`,
  `adjacentMoves` and the deadline presets → `@odin/domain`. Today, Tasks, row
  menus and move availability match web.
- `formatDueAt`, `formatDueShort`, `formatLongDate`, `progressText` and
  `TASK_ACTION_KEYS` → `@odin/i18n`, with every string in both languages.

The read hooks in `src/state/queries.ts` are deliberately **not** shared: they
are per-app glue binding an app-specific context to the already-shared
repositories and query keys.

## Android specifics

- **Session storage.** `expo-secure-store` rejects values over 2048 bytes and a
  Supabase session routinely exceeds that, so `src/session-storage.ts` splits
  the value across numbered chunks behind a manifest. Chunk boundaries never
  split a surrogate pair, because a lone surrogate is replaced on the UTF-8
  round trip through the keystore and would corrupt the session. A partially
  written session reads back as absent rather than corrupt. The auth client
  reads the session before every request and on every realtime heartbeat, so
  the adapter keeps it in memory after the first read; the keystore is read once
  per process and written on every change.
- **Foreground reconciliation.** `AppState` drives an authoritative membership
  refetch when Android returns the app to the foreground or the network
  returns, so a revoked member cannot keep acting on cached household data.
  That is one reconcile per return. The realtime channel is joined once per
  household and survives background and network changes, and a (re)join
  reconciles only while the app is in use.
- **Fallback polling backs off.** While the channel is down, the app reconciles
  after 5, 10, 20 and 40 seconds and then once a minute, and not at all when
  offline or in the background. Android pauses JavaScript timers in the
  background anyway, which is also why realtime hints are coalesced on the
  clock, not by a timer (`subscribeToHousehold` in `@odin/data`): the first
  change after a quiet half-second is delivered at once, so a backgrounded but
  running app still refetches and can announce it (risk R9).
- **Sync time renders once a minute.** Every successful read reports a sync,
  but the stored time only changes when the minute the stale banner shows
  changes, so a refresh does not re-render every screen. The stale banner only
  shows once signed in; the auth forms say offline in their own words.
- **Only changed rows render.** Task rows and list rows are memoized, row
  models are cached per task object (a refetch keeps an unchanged task's
  object), and row handlers keep one identity (`useEvent`). Deadline
  formatters are built once per locale and time zone.
- **Reads wait for the network.** `@react-native-community/netinfo` drives the
  offline banner and React Query's online state, so a read made offline pauses
  and resumes on reconnect instead of failing, and a screen with nothing loaded
  says it is offline rather than spinning. A still-running reachability probe
  is not treated as offline. Reads go stale after five minutes; realtime hints
  and reconciles cover the rest.
- **Bottom navigation** remains visible while scrolling, approved in the
  2026-10-13 mobile review. There is no scroll listener or navigation animation.
  Tabs, floating actions, list quick add and content spacers share a height
  calculation that accommodates system text size and bottom safe-area insets.
- **`src/state/`, not `src/app/`.** Expo Router treats a `src/app` directory as
  the routes root.

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

## Presentation

Android adapts the presentation, never the rules; the screens themselves are
in `features.md`.

- Bottom-navigation icons are drawn from views, with no icon font or native
  dependency.
- Extended floating action buttons for the primary create action on Today
  (New task), Tasks (New task) and Lists (New list). List detail has a quick
  add docked above the persistent navigation instead.
- Secondary task and list actions use Android overflow controls and modal
  bottom menus rather than rows of desktop buttons.
- Task-template selection uses a scrollable bottom picker, so long titles and a
  growing template collection do not crowd the editor.
- List detail has an explicit in-app back control alongside Android system
  back.
- Destructive actions keep the native confirmation alert.
- Completion and Claim stay directly reachable: they are the primary action of
  their row. Reorder is in the Lists toolbar or the list-detail menu.
- Confirmations such as a saved template use an Android toast.
- Touch targets stay at least 48 dp, every control carries a TalkBack label,
  and English/Bulgarian text is shared with web.

## Lists, templates and notes on Android

| Action                     | Where it lives                                    | Command                     |
| -------------------------- | ------------------------------------------------- | --------------------------- |
| Save a list as a template  | Overflow on the Lists row and on list detail      | `save_list_template`        |
| Delete a list or template  | Overflow on the Lists row and on list detail      | `delete_list`               |
| Read a list's shared note  | Lists row; collapsible Notes on list detail       | `get_home_v2`/`get_list_v2` |
| Write a list's shared note | Note field under the subtitle field in the editor | `update_list_v2`            |

- Save as list template takes no confirmation alert; a toast confirms it. The
  source list keeps its version.
- `Delete list` appears on template rows as well as active ones, with the same
  destructive alert and the `expected_version` the summary already carries.
- Saving a list writes **one list template** and never a task template, so the
  task editor's picker keeps reading `get_task_templates` alone.
- The list note is a `multiline` field with `numberOfLines={4}` under the
  subtitle field, validated with the shared `validateNotes`. An empty field
  submits `null`, never an empty string. `updateList` is called with `notes`,
  which routes to `update_list_v2`; omitting `notes` entirely would keep the
  legacy note-preserving `update_list`, a path that exists for installed builds
  rather than this one.

## Notifications

What they do is `features.md`; this is how Android does it. Added 2026-09-22
by owner amendment (`decisions.md`).

`expo-notifications` 57.0.22, the SDK 57 version, and its config plugin are
native dependencies, so **an installed build does not gain notifications until
the Android binary is rebuilt.**

| Piece                               | Lives in                                |
| ----------------------------------- | --------------------------------------- |
| The decision rules, pure            | `@odin/domain` `notifications.ts`       |
| The only `expo-notifications` calls | `src/notifications/adapter.ts`          |
| The per-device mute                 | `src/notifications/preference.ts`       |
| The watcher                         | `src/state/useTaskNotifications.ts`     |
| Permission, mute and mounting       | `src/state/NotificationSettings.tsx`    |
| The Settings control                | `src/components/NotificationToggle.tsx` |

- **The rules are shared, the delivery is not.** `planDueReminders` and
  `diffAssignedTasks` are pure functions in `@odin/domain` with no platform
  import, so the Android client owns only the transport. That is deliberate:
  if push is ever added, the adapter is replaced and the rules are not.
- **Nothing new is fetched.** The watcher reads `getMyTasks` and
  `getUnassigned`, which the app already has, and compares the per-task
  `version` the contract increments once per change. This is why the feature
  needed no contract change and why the web client is untouched.
- **It is mounted on the `(app)` layout, not a screen.** The watcher has to
  keep both queries live whichever section is open, and while no screen is
  focused at all.
- **Announcements are suppressed in the foreground.** This is the whole of the
  self-notification defence: a member cannot be tapping Claim in the foreground
  and be somewhere else at the same time. The alternative — a list of task IDs
  the device just mutated — has to be updated at every task mutation call site,
  and a new one that forgets it produces a notification about your own edit.
- **Scheduled reminders are reconciled, not tracked.** The set Android already
  holds is read back through `getAllScheduledNotificationsAsync` rather than
  remembered in the app, so a restart cannot desynchronise it. Identifiers are
  `odin-due:<locale>:<taskId>:<stage>`, which makes rescheduling idempotent and
  makes a language change retire the old wording rather than leave a Bulgarian
  member with English reminders.
- **Reminders do not outlive the account.** `OdinProvider.applyUser` cancels
  every scheduled reminder when the identity changes away from a signed-in
  account, because a reminder carries a task title. A cold start is
  deliberately excluded: reminders are rebuilt from a fetch, and wiping them
  before one succeeds would disarm a device that has no network.
- **`useAppForeground` is shared** with `useHouseholdRealtime`, which needed the
  same answer for its membership reconciliation. Two listeners disagreeing
  about "foregrounded" would have been a bug waiting to happen.
- **Failures are swallowed on purpose.** A notification that cannot be posted
  must not break the screen behind it; the warning it logs is generic, because
  household text never reaches a log.

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

The production profile creates an installable APK with internal distribution,
continuing the existing release route. Keep the existing EAS-managed signing
credentials (`--freeze-credentials`); do not mint another app identity or key.
`EXPO_PUBLIC_WEB_ORIGIN` in that environment must point at
`https://odin-ten-tau.vercel.app` so copied invitations open the web flow.

## Owner decisions still required

These are proposals, not settled product scope (`docs/decisions.md` item 5):

| Topic                | Proposed                       | Needs                                                                                                                                                                                          |
| -------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package identifier   | `app.odin.household`           | Existing EAS APK identity retained for the approved 2026-10-13 release; store listing remains separate                                                                                         |
| Distribution         | Private APK                    | Existing internal builds verified on EAS on 2026-10-13; production profile now creates APKs with existing managed signing. No signing material may be committed                                |
| Invitation link base | `EXPO_PUBLIC_WEB_ORIGIN`       | **Settled**: point it at the deployed web client, `https://odin-ten-tau.vercel.app`. Left unset, links fall back to `odin://invite`, which is useless to a recipient without the app installed |
| Deep links           | `odin://invite#token=…` scheme | Verified Android App Links need a domain and `assetlinks.json`                                                                                                                                 |

The token is read only from the link fragment. A query parameter is deliberately
rejected so the contract's "keep tokens out of request paths" rule cannot be
undone by accident.

## Device verification

Nothing in the Android client has run on an emulator or a physical device; an
export is not an installation. Device verification is deferred by owner
decision of 2026-09-22 (accepted section of `known-risks.md`), and what a
device pass must cover is listed in `verification.md`. Revisit it before any
release claim or store listing.
