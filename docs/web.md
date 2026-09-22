# Web client

React + Vite + TypeScript in `apps/web`, deployed to Vercel at
`https://odin-ten-tau.vercel.app`. It is the full authenticated application,
not a marketing page, and it shares the contract, domain rules, translations,
design tokens and data adapter with Android.

Hosting configuration and the deploy procedure are in `operations.md`.

## Ownership

Owns `apps/web/**`, web behaviour tests and the web hosting configuration. Uses
the shared packages rather than duplicating business rules; changes to
`@odin/data`, `@odin/domain` or `@odin/i18n` are coordinated, never forked into
a web-only API.

## Desktop layout

Persistent left navigation, a content panel and an optional side editor. On
narrow viewports it falls back to the bottom navigation the source requirements
specify. Persistent desktop navigation is a documented adaptation, not a
replacement of the confirmed behaviour — core destinations and actions are
identical on both platforms.

Home uses two clearly labelled sections, keeping bordered template cards and
unbordered active-list cards. Width is used through a grid of constrained
readable cards, not stretched text. Active-list progress shows count plus
percentage. A task row carries completion, title, assignee, deadline and the
edit action, wrapping metadata on narrow widths rather than scrolling
horizontally.

### Interaction rules

- Real buttons and links, labelled form fields. Clicking completion never opens
  the editor; Space and Enter do what the control says.
- Copy controls get descriptive names ("Create list from …").
- Escape closes a dialog without saving and returns focus to its trigger;
  unsaved changes are handled explicitly.
- No button nested inside another clickable button or card.
- 44×44 CSS pixel targets even with a mouse; contrast checked in both
  languages; overdue is text, not colour alone.
- Long task names wrap, assignee chips keep their names, and Bulgarian text
  does not overflow.

## Authentication

Email registration, confirmation link and password login, replacing the
original code-entry flow. Android uses the same shared APIs and finishes its
confirmation and recovery links here.

1. `/register` — email, password, confirmation. Eight-character minimum, exact
   comparison, no trimming. Submission shows neutral inbox instructions and a
   60-second resend cooldown. An existing account is directed to sign-in or
   recovery **without disclosing that the account exists**.
2. Supabase sends its default confirmation link, which redirects to
   `/auth/confirmed`. The app establishes the confirmed session and offers
   Continue; later logins use email and password.
3. `/sign-in` — email, password, visibility control, Create account and Forgot
   password links. Wrong credentials get a generic error. An unconfirmed
   account can resend confirmation. Language can be switched before login.
4. `/forgot-password` — sends a default recovery link with a neutral
   acknowledgement and resend cooldown. This is also how an account created
   under the old one-time-code flow gains a password, on its existing identity.
5. `/reset-password` — requires a successfully restored recovery session, then
   validates and updates the password through Supabase Auth.

No password, token or email is stored in application tables or logs. Profiles,
user IDs, memberships and RLS policies are untouched by any of this.

### Callback and session handling

`apps/web/src/main.tsx` disables automatic URL session detection and handles
email callbacks exactly once before React StrictMode mounts. `auth-links.ts`
captures the implicit-flow fragment, removes it from browser history
immediately, calls `restoreEmailSession`, and routes recovery ahead of normal
onboarding. An invalid or expired link produces a safe error and never
authorizes a password update using an unrelated existing session.

The recovery UI marker holds only a user ID and an expiry, lives in
sessionStorage with a memory fallback, and is bound to the recovered user for at
most an hour. It is navigation state, not authorization — Supabase validates the
session and the password operation. Switching to PKCE or custom token-hash
templates requires a coordinated callback change and tests; do not toggle it
independently.

Internal `next` destinations reject external URLs and auth-route loops. An
invitation bearer is held in tab memory across login route unmounts and cleared
on redemption or logout. A reload, or the email opened in another tab, loses
that in-memory invitation and the UI asks the member to reopen the original
link — never persist the bearer just to save a click.

The web provider clears cached household queries when identity changes,
including cross-tab auth events. An initial session lookup cannot overwrite a
later auth event.

## Security headers

A tested CSP allows the required Supabase HTTPS and WebSocket connections
without unsafe dynamic HTML, alongside a restrictive referrer policy and
sensible transport headers. Authentication and Realtime are validated after any
header change. Invitation fragments, tokens and household contents are never
logged to analytics. Source maps, if uploaded for error tracking, must contain
no secrets.

## Equal permissions

Every household member has the same task-management permissions. The settings,
members and invite screen is the whole of it. There is no role dropdown and no
hidden superuser bypass. A future operational admin console would need a
separate approved access model, auditing and a server-only privileged backend;
it must never ship a service-role key to the browser.
