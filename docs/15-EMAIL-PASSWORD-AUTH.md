# Web email/password authentication

Owner request: replace the code-entry web flow with email registration and password login. Android is a separate draft handoff in `16-MOBILE-PASSWORD-AUTH-AGENT.md`.

## User flow

1. `/register`: email, password, confirmation; eight-character minimum, exact password comparison, no trimming. On submission, show neutral inbox instructions and a 60-second resend cooldown. Existing accounts are directed to sign-in/recovery without disclosing account existence.
2. Supabase sends its default confirmation link. After verification it redirects to `/auth/confirmed`. The app establishes the confirmed session and offers Continue; later logins use email/password.
3. `/sign-in`: email and password, password visibility control, Create account and Forgot password links. Incorrect credentials receive a generic error. An unconfirmed account can resend confirmation. English/Bulgarian switching is available before login.
4. `/forgot-password`: sends a default recovery link, with a neutral acknowledgement and resend cooldown. Existing OTP users use this to set a password on their existing identity.
5. `/reset-password`: requires a successfully restored recovery session. Save validates the new password and updates it using Supabase Auth. The user can continue in that authenticated session and use the new password on later sign-ins.

No password, token or email is stored in application tables or logs. Profiles, user IDs, household memberships and RLS policies are unchanged.

## Callback and session handling

`apps/web/src/main.tsx` disables automatic URL session detection and handles email callbacks exactly once before React StrictMode mounts. `auth-links.ts` captures the implicit-flow fragment, immediately removes it from browser history, calls `restoreEmailSession`, and routes recovery ahead of normal onboarding. Invalid or expired links produce a safe error and never authorize a password update using an unrelated existing session.

The recovery UI marker contains only user ID and an expiry, lives in sessionStorage with memory fallback, and is bound to the recovered user for at most one hour. It is navigation state, not authorization; Supabase validates the session and password operation. Credentials remain in Supabase's existing browser session storage. Changing to PKCE or custom token-hash email templates requires a coordinated callback change and tests; do not toggle it independently.

Internal `next` destinations reject external URLs and auth-route loops. Invitation bearers are held in tab memory across login route unmounts, then cleared on redemption or explicit logout. A reload or email opened in another tab loses the in-memory invitation; the UI asks the user to reopen the original invitation. Never persist that bearer merely to avoid the extra click.

The web provider clears cached household queries when identity changes, including cross-tab auth events. Initial session lookups cannot overwrite a later auth event.

## Hosted configuration

Project: Odin `mvltbhtsukorspmpyhpw`. Main web domain: `https://odin-ten-tau.vercel.app`.

On 2026-09-21 the dashboard showed Site URL `http://localhost:3000` and no redirect allowlist. Corrected to:

| Setting                  | Value                                            |
| ------------------------ | ------------------------------------------------ |
| Site URL                 | `https://odin-ten-tau.vercel.app`                |
| Redirect URL             | `https://odin-ten-tau.vercel.app/auth/confirmed` |
| Redirect URL             | `https://odin-ten-tau.vercel.app/reset-password` |
| Email provider / signups | Enabled                                          |
| Confirm email            | Enabled                                          |
| Minimum password length  | 8                                                |

Keep the default confirmation/reset templates with their Supabase verification links. Do not replace the verification link with a bare app URL. Old already-issued links can retain their former destination; request fresh links after this change.

Vercel still needs only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. No service-role key, SMTP password or new auth secret belongs in `VITE_*`. These values are embedded at build time; redeploy after changing them. The local `supabase/config.toml` uses localhost Vite callbacks and confirmation enabled for parity; **do not push that local config wholesale to production**.

## Remaining hosted limitations

Custom SMTP is not configured. Supabase's default test mail service restricts recipients and throughput. General household registration and recovery require a configured sender/provider and real inbox delivery tests. Password login works without sending email once an account is confirmed and has a password. Do not disable confirmation as a workaround or create a new identity for existing users.

Security Advisor reports leaked-password protection disabled. The dashboard marks that feature Pro-plan-only; no plan upgrade is authorized by this implementation. Use long unique passwords. No SQL security changes were required.

## Validation and operations

Verified on 2026-09-21:

| Check                                                                                 | Result                                                                                                                                            |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                                                       | Passed lint, formatting, all workspace typechecks, 6 tooling tests, 124 Vitest tests and 38 mobile Jest tests                                     |
| `npm run test -- apps/web/src/auth-links.test.ts apps/web/src/routing.test.ts`        | Passed 15 tests after the final encoded/case/trailing-slash redirect-loop fix                                                                     |
| `npx eslint apps/web/src/routing.ts apps/web/src/auth-links.test.ts --max-warnings 0` | Passed for the final redirect change                                                                                                              |
| `npm run build`                                                                       | Passed against the Odin production Supabase host                                                                                                  |
| Browser, production build served locally                                              | Sign-in/registration navigation, Bulgarian registration layout and direct-reset rejection verified                                                |
| Hosted auth settings                                                                  | Public settings endpoint confirms email enabled, signups enabled and email confirmation required; dashboard confirms corrected Site URL/callbacks |
| Security Advisor                                                                      | One warning: leaked-password protection disabled (Pro-plan feature)                                                                               |

Initial checks caught strict optional-property and test-query typing mistakes; these were corrected without disabling rules. The first mobile test run failed discovery because Jest interpolated mixed Windows path separators; the mobile config now uses relative glob patterns under the same workspace root, and all 38 existing tests run. A focused Vitest `--project apps/web` command failed because the project has no matching name; the supported file-filter command above passed. No checks were suppressed.

Vite reports a non-blocking bundle-size warning (about 559 kB minified, 159 kB gzip). Code splitting is follow-up performance work. Real inbox confirmation/recovery delivery and Android password screens remain unverified/not implemented respectively; do not describe either as complete.

Automated tests cover shared provider calls/error mapping, no password normalization, registration policy, generic duplicate/reset responses, safe redirects, malformed/expired callbacks, recovery binding, invitation retention, offline forms and password clearing. Run `npm run check` and `npm run build` with configured public environment variables. Hosted email delivery and a real inbox confirmation/recovery round trip are separate checks; mocks do not prove delivery.

Rollback: redeploy the previous web artifact if necessary; leave corrected production URL settings in place. Existing identities and passwords remain valid. Keep additive shared auth exports and legacy OTP exports until mobile migration is complete.

References: [Supabase password auth](https://supabase.com/docs/guides/auth/passwords), [password reset](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
