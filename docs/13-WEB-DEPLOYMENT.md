# Odin web deployment

## Required Vercel configuration

The Vite client requires these public, environment-scoped build variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Set both for Preview before validating a pull-request deployment. Use the Odin staging Supabase project for Preview. Production must use a separate approved production project; do not point previews at production family data and never use Passport resources.

Vite embeds `VITE_` variables during the build. Adding or changing them does not repair an existing artifact: redeploy the affected commit after configuration changes. The production build fails when either value is absent or whitespace-only, and when `VITE_SUPABASE_URL` is not an absolute URL or is plaintext against a non-loopback host, so Vercel cannot mark an unusable bundle Ready. A configured trailing slash is normalised away.

## Confirming which backend an artifact targets

A built bundle is opaque, and its asset hash cannot be reproduced locally because Vercel builds on a different Node major. The build therefore logs its target host, which is public:

```
[odin] building against <project-ref>.supabase.co
```

Read that line in the Vercel build log for the deployment under review. Preview must name the staging project; production must name the approved production project. The publishable key is never logged.

## Deployment protection

The project currently enables Vercel Authentication for every deployment except custom domains, so preview URLs return a Vercel login wall to anyone outside the team. Disable it for the deployments that need outside review, or add the reviewers to the team; the application's own sign-in is unaffected either way.

## Verification

After redeployment, verify:

1. The build log names the expected Supabase project, and `/` renders the email one-time-code sign-in form instead of `Configuration required`.
2. Refreshing `/invite` and `/lists/<uuid>` returns the SPA and preserves the internal redirect to sign-in.
3. Browser console and page-error capture are empty.
4. Supabase Auth accepts the exact preview callback origin.
5. A normal authenticated staging user can create a household, list and task and a second browser observes the Realtime invalidation.

The Vercel project uses the repository-root `vercel.json`, builds `@odin/web`, emits `apps/web/dist`, rewrites SPA routes to `index.html`, and applies the checked-in security headers.
