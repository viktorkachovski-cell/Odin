# Mobile QA record

Branch reviewed: `vikc/serene-goldberg-u8geqs` (Android email/password work)

The review found and fixed these implementation defects:

- auth forms now scroll and avoid the keyboard on small screens and large text;
- profile/household read failures show a generic retry state instead of being
  mistaken for a missing account and silently routing to onboarding;
- onboarding rejects signed-out direct access and does not offer household
  creation when membership already exists;
- invite destinations survive registration and password recovery;
- invitation fragments are accepted only from the registered Odin invite routes,
  and a consumed launch URL cannot be re-captured after sign-out;
- Android commands use Expo's native cryptographic UUID generator rather than
  assuming a browser `crypto.randomUUID` global;
- Supabase auth refresh starts and stops with Android foreground/background
  state;
- account changes clear React Query data and mounted form drafts; profile
  language is hydrated from the account;
- realtime recovery invalidates household, membership, home, task and list
  queries and stops polling while offline or backgrounded;
- an unexpected auth adapter failure clears password state and renders the
  generic error.

The request-ID change is additive. Web keeps the browser crypto default; the
Android bootstrap calls `configureRequestIdGenerator(randomUUID)` before any
screen can issue a command. The auth lifecycle wrapper is also additive and
does not alter web visibility handling.

Baseline automated checks completed locally before the parity release:

- `npx expo-doctor` — 21/21 checks passed;
- mobile Jest in-band — 11 suites, 88 tests passed;
- root typecheck — all workspaces passed;
- Expo Android export was attempted after the native dependency change. The
  sandbox blocked Hermes worker creation with `spawn EPERM`; CI should rerun
  `npm run build:check --workspace @odin/mobile`.

The normal parallel Jest/export commands can also hit Windows worker `spawn
EPERM` in this environment. This is an execution limitation, not an app
assertion failure; the in-band test run passed.

Still pending before an Android release claim:

1. Build/install a development or EAS Android binary on a real device or
   emulator; no Android SDK or device is available on this machine.
2. Verify SecureStore persistence, token refresh, deep-link invitation
   redemption, password-manager autofill, TalkBack, dynamic font scaling and
   English/Bulgarian long labels on hardware.
3. Verify registration, confirmation and password-recovery email delivery in a
   real inbox. Supabase's default SMTP is still subject to its hosted-project
   delivery restrictions; custom SMTP remains unconfigured.
4. Verify Android/web two-member synchronization through disconnect/reconnect.

These pending checks do not block merging the reviewed code after CI passes,
but they do block describing the Android app as device-verified or released.

## Follow-up parity release — 2026-09-21

Commit `8c74b84` updated the Android presentation to match the delivered web
functions without changing the shared contract: primary creation uses extended
FABs, secondary task/list actions use bottom menus, task templates use a
scrollable picker, and list detail has an explicit back control. The follow-up
run passed 11 mobile suites with 89 tests, root lint, formatting, all workspace
typechecks, 8 tooling tests, Expo Doctor 21/21 and the Android production
export. GitHub Quality passed all five jobs for the commit.

The device-level checks above remain open.
