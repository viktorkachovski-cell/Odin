# Vercel desktop web implementation agent

## Mission and ownership

Build the full desktop version of Odin in `apps/web` using React, Vite and TypeScript. This is an authenticated working app with feature parity for the confirmed task flows, not a marketing page or mock dashboard. Read architecture, decisions, contract, code standards and verification docs first.

Own `apps/web/**`, web behavior/end-to-end tests, web hosting configuration and deployment instructions. Use shared packages; coordinate edits rather than duplicating mobile business rules.

## Implementation order

1. Bootstrap Vite in the npm workspace using the React version aligned with the selected Expo stack. Add React Router, shared data/query adapters, localization, strict typecheck and testing scripts.
2. Implement email OTP sign-in and onboarding/invitation routes. Preserve destination safely through authentication; allow only internal redirect paths. Clear invite tokens from history after capture. Handle used/expired/revoked links and existing-household users explicitly.
3. Build the same Home, list/editor, Unassigned, My Tasks and Settings flows specified in the mobile brief and source requirements. All actions call the shared commands, use request IDs and handle version conflicts.
4. Add a desktop layout with persistent left navigation, content panel and optional side editor. On small viewports, use source-specified bottom navigation. Persistent desktop navigation is a proposed desktop adaptation; keep core destinations and actions identical and record for UI review.
5. Add loading/empty/offline/retry/conflict states and two-client realtime invalidation. Verify route refresh, browser back/forward, signed-out deep links and account switching.
6. Add tests, production build and staging deployment instructions. Provision/connect Vercel only after the Odin project and staging settings are explicitly selected.

## Desktop UI specifics

Home uses two clearly labeled sections; retain bordered template cards and unbordered active-list treatment. Increase usable width through a grid with constrained readable cards, not stretched text. Active list progress shows count plus percentage. Task detail uses a row layout: completion, title, assignee name/avatar, deadline, edit action. On narrow widths, wrap metadata without horizontal scrolling.

Use real buttons/links and labeled form fields. Clicking completion never opens the editor; keyboard Space/Enter performs the expected action. Give copy buttons descriptive names (“Create list from …”). Escape closes a dialog without saving, focus returns to its trigger, and unsaved changes are handled explicitly. Avoid nesting buttons within clickable buttons/cards.

Tabs/rows must support keyboard and screen readers; maintain 44x44 CSS pixel targets from the source requirement even with a mouse. Text, border and focus contrast are checked in both languages. Use visible overdue text; don't rely on red alone. Long task names wrap, assignee chips do not hide names, and Bulgarian text does not overflow.

## No invented administrator role

Every household member has the same task-management permissions. A settings/members/invite screen is sufficient for MVP. Do not add a role dropdown or hidden superuser bypass. A future operational admin console needs a separate approved access model, auditing and server-only privileged backend; it must not ship a service-role key to the browser.

Seed updates remain a reviewed backend process. Editing reusable templates from a web “admin” page is deferred because template authoring rules are undefined.

## Hosting contract

Create a separate Vercel project linked to `viktorkachovski-cell/Odin` after authorization. Configure root directory `apps/web`, framework Vite, output `dist`, and an install/build workflow that resolves the repository root npm lockfile and shared workspaces. Enable access to shared files outside the root when required by the selected Vercel monorepo setup. Prove a preview build from the full repository; do not upload only the web subtree and omit shared packages.

Suggested build at repository root: `npm ci` then `npm run build --workspace @odin/web`. If the hosting build starts in `apps/web`, configure commands deliberately for that working directory. Record tested commands, not guesses.

SPA routes must resolve to `index.html`, including `/lists/:id`, `/invite` and auth routes. Preserve static asset responses and any real API routes if introduced later. Configure routing using current Vercel guidance and test direct route refresh; do not assume dev-server history fallback exists in production.

Client variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`; Android equivalents are `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. These are public, scoped to the selected environment. Secrets, OTP delivery credentials and privileged tokens must never use those prefixes.

Preview uses staging Supabase; production uses production. Configure exact Auth callback/deep-link allowlists and invitation base URLs. Do not allow arbitrary redirect origins. OTP code entry need not rely on email links, but browser/native invitation routing still needs verification.

Add a tested CSP allowing required Supabase HTTPS/WebSocket connections without unsafe dynamic HTML, restrictive referrer policy and sensible transport/security headers. Validate authentication and Realtime after adding headers. Never log invitation fragments, tokens or household contents to analytics. Vite source maps, if uploaded for error tracking, must not contain secrets.

## Verification and handoff

Run lint, typecheck, Vitest/component tests, Playwright flows, accessibility checks and production build. Test English and Bulgarian at phone, tablet and desktop sizes, keyboard-only use and browser refresh on nested routes. Verify two browser sessions and Android-to-web changes within the normal five-second requirement, plus missed-event recovery.

Provide preview URL and commit SHA only when a preview actually exists; record configuration and test evidence. Production promotion is a separate release step following acceptance. No automatic production database migrations from arbitrary preview builds.

Suggested agent prompt: “Implement `docs/05-WEB-AGENT.md` as the functional desktop client using the shared backend. Preserve all confirmed family-member permissions, test English/Bulgarian flows and staging routing/synchronization, and document Vercel release prerequisites.”
