# Lifecycle production deployment — 2026-09-21

Supabase project: Odin (`mvltbhtsukorspmpyhpw`). Application commit: `fb97fa5`.

Applied through Supabase MCP, without resets or data replacement:

| Repository migration                                | Hosted version   |
| --------------------------------------------------- | ---------------- |
| `20260921180000_delete_list_task_commands.sql`      | `20260921125204` |
| `20260921190000_lifecycle_function_permissions.sql` | `20260921125328` |

Hosted and local initial migration histories already differ; do not blindly
push the full local migration history to this project. Match the applied
migration names and contents before planning later deployments.

Verification found hosted default grants allowed anonymous execution of the
new functions. The follow-up migration removes PUBLIC/anon execution and
preserves existing authenticated execution on public wrappers and private
implementations. This matches the existing `update_task` permissions. All
four functions were verified: authenticated=true, anon=false. Declarative
grants were updated too, so rebuilding the local schema preserves access.

`supabase/smoke/lifecycle-smoke.sql` passed on production using randomly
generated synthetic identities and a transaction ending in ROLLBACK. It
checks unauthenticated rejection, assignment removal with deadline preserved,
task deletion, list archival with tasks retained, stale-version conflicts,
idempotent retries, cross-household isolation and archived-list rejection.
No real household records were modified or returned.

Security advisor: leaked-password protection remains disabled. See
[Supabase password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
Performance advisor reported three existing unindexed foreign keys and a
missing primary key on `private.invitation_attempts`; these are unrelated
to the new commands. See the [foreign-key index guidance](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)
and [primary-key guidance](https://supabase.com/docs/guides/database/database-linter?lint=0004_no_primary_key).

The owner reported the matching Vercel production deployment completed and
confirmed task deletion works at `odin-ten-tau.vercel.app`. This is owner
acceptance evidence; the deployment connector did not independently provide
the build identifier in this session.

## Follow-up client release — 2026-09-21

The Android/web parity release was committed as `8c74b84` and pushed to GitHub
`main`. GitHub Quality passed lint/formatting, typecheck, tooling tests,
shared/web tests, mobile tests, Expo Doctor and Android export. Vercel's
automatic deployment for the commit also completed successfully. No Supabase
migration was required for this client-only change.
