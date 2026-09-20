# Odin web deployment

## Required Vercel configuration

The Vite client requires these public, environment-scoped build variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Set both for Preview before validating a pull-request deployment. Use the Odin staging Supabase project for Preview. Production must use a separate approved production project; do not point previews at production family data and never use Passport resources.

Vite embeds `VITE_` variables during the build. Adding or changing them does not repair an existing artifact: redeploy the affected commit after configuration changes. The production build now fails when either value is absent or whitespace-only, preventing Vercel from marking an unusable bundle Ready.

## Verification

After redeployment, verify:

1. `/` renders the email one-time-code sign-in form instead of `Configuration required`.
2. Refreshing `/invite` and `/lists/<uuid>` returns the SPA and preserves the internal redirect to sign-in.
3. Browser console and page-error capture are empty.
4. Supabase Auth accepts the exact preview callback origin.
5. A normal authenticated staging user can create a household, list and task and a second browser observes the Realtime invalidation.

The Vercel project uses the repository-root `vercel.json`, builds `@odin/web`, emits `apps/web/dist`, rewrites SPA routes to `index.html`, and applies the checked-in security headers.
