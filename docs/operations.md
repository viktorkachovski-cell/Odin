# Operations

How to deploy, configure and verify the hosted system. What has been deployed
is `deployment-log.md`.

## Environments

Odin runs **one hosted environment**, by owner decision of 2026-09-20 (see
`architecture.md`). The Supabase project `mvltbhtsukorspmpyhpw` in
`eu-central-1` and the Vercel project `odin` are production. Vercel previews
read and write the same database as production — a deliberate trade for a
private single-owner project, and risk R4 in `known-risks.md`.

Local Supabase is disposable development. Odin must stay separate from
Passport; that is not negotiable. Never aim a reset at the hosted project.

Provisioning is complete. Recheck access before any administrative operation:
a read-only list call does not prove a mutating one will succeed.

## Deploying a database change

1. Edit the declarative schema under `supabase/schemas/`, never a published
   migration. Generate the migration with `npm run db:diff -- -f <name>` and
   review it.
2. Replay locally (`npm run db:start`, `db:lint`, `db:test`,
   `db:test:concurrency`) where Docker is available; CI's `Database` workflow
   does this on every push regardless.
3. Apply to the hosted project **before** merging client code that calls the
   new RPCs, or the deployed client calls functions that do not exist yet.
4. Verify privileges explicitly. Hosted default grants have previously allowed
   anonymous execution of new functions — confirm `anon` cannot execute and
   `authenticated` can, for both the public wrapper and the private helper.
5. Run the matching script in `supabase/smoke/` against the hosted project
   inside a transaction that cannot commit, and compare row counts before and
   after. These scripts assert by raising rather than declaring a pgTAP plan,
   which is why they live outside `supabase/tests/`.
6. Regenerate `packages/contracts/src/database.generated.ts` if any signature,
   column or function changed, and commit it unedited.
7. Read the security and performance advisors and record every finding.
8. Append an entry to `deployment-log.md`.

Hosted and local migration histories already diverge. Match applied names and
contents rather than pushing the full local history.

## Vercel configuration

The Vite client needs two public, environment-scoped build variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Set both in **every** scope the project deploys: Production, Preview and
Development. A production deploy fails until the Production scope carries both;
that is the build gate working. Setting them for Preview alone leaves
production unbuildable.

Vite embeds them at build time, so changing a variable does not repair an
existing artifact — redeploy the affected commit. The build fails when either
is absent or whitespace-only, and when `VITE_SUPABASE_URL` is not an absolute
URL or is plaintext against a non-loopback host, so Vercel cannot mark an
unusable bundle Ready. A trailing slash is normalised away.

The Vercel project uses the repository-root `vercel.json`, builds `@odin/web`,
emits `apps/web/dist`, rewrites SPA routes to `index.html`, and applies the
checked-in security headers.

Android equivalents are `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, plus `EXPO_PUBLIC_WEB_ORIGIN` pointing
at the deployed web client. All of these are public by design. Secrets, SMTP
credentials and privileged tokens must never use those prefixes.

### Which backend did an artifact build against?

A built bundle is opaque and its asset hash cannot be reproduced locally,
because Vercel builds on a different Node major. The build therefore logs its
target host, which is public:

```
[odin] building against <project-ref>.supabase.co
```

Read that line in the build log for the deployment under review. Every scope
must name the Odin project. A build naming anything else — above all Passport —
must not be promoted. The publishable key is never logged.

### Deployment protection

Vercel Authentication is enabled for every deployment except custom domains, so
preview URLs show a Vercel login wall to anyone outside the team. Disable it for
deployments that need outside review, or add the reviewer to the team. The
application's own sign-in is unaffected either way.

## Supabase Auth configuration

| Setting                  | Value                                            |
| ------------------------ | ------------------------------------------------ |
| Site URL                 | `https://odin-ten-tau.vercel.app`                |
| Redirect URL             | `https://odin-ten-tau.vercel.app/auth/confirmed` |
| Redirect URL             | `https://odin-ten-tau.vercel.app/reset-password` |
| Email provider / signups | Enabled                                          |
| Confirm email            | Enabled                                          |
| Minimum password length  | 8                                                |

Keep the default confirmation and reset templates with their Supabase
verification links; do not replace a verification link with a bare app URL.
Preview callback URLs need an explicit allowlist entry — never a wildcard for
all Vercel projects. Already-issued links keep their former destination, so
request fresh links after changing this.

The local `supabase/config.toml` uses localhost callbacks for parity. **Do not
push that local config wholesale to production.**

**Custom SMTP is not configured**, so confirmation and recovery mail cannot be
delivered to general recipients. That is risk R1 in `known-risks.md` and the
one open item that blocks a real person today. Do not disable confirmation as a
workaround, and do not create a new identity for an existing user.

## Post-deployment verification

1. The build log names the expected Supabase project, and `/` renders the
   email/password sign-in form rather than `Configuration required`.
2. Refreshing `/invite` and `/lists/<uuid>` returns the SPA and preserves the
   internal redirect to sign-in.
3. Browser console and page-error capture are empty.
4. A normal authenticated user can create a household, list and task, and a
   second browser observes the Realtime invalidation.

## Dependency warning triage

Reviewed against the current lockfile after a successful deployment. These are
maintenance signals, not evidence that the deployed application failed.

| Urgency | Warning                                                                   | Assessment and action                                                                                                                                              |
| ------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| High    | `engines.node: >=22` permits an automatic future major                    | Fixed by pinning `22.x`, matching CI and preventing an unreviewed Vercel runtime jump                                                                              |
| Medium  | `@testing-library/jest-dom` 6.10.x was withdrawn                          | Fixed by pinning 6.9.1, the upstream-recommended 6.x release; test-only, never in the production bundle                                                            |
| Medium  | ESLint 9 is end-of-life                                                   | Open. ESLint 10 cannot be adopted until the accessibility plugin's published peer range supports it; keep accessibility linting enabled. See `code-standards.md`   |
| Low     | `glob@7`, `inflight`, `uuid@7`, `whatwg-encoding`, `abab`, `domexception` | Transitive development dependencies from Expo/Jest tooling; the lockfile audit reports zero known vulnerabilities. Resolve through a tested upgrade, not overrides |

Re-run `npm audit`, all workspace tests, the Android bundle check and the Vercel
production build when upgrading Expo, Jest or ESLint.

## Standing advisor findings

Both predate the current work and neither is new:

- Leaked-password protection is disabled. The dashboard marks it a Pro-plan
  feature; no plan upgrade is authorized.
- `public.task_templates` has RLS enabled with no policies. That is
  intentional: all direct table privileges are revoked and the household-scoped
  read RPC is the only read surface.
