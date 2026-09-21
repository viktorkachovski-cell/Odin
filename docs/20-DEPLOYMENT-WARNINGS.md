# Deployment warning triage

Reviewed against the current lockfile after the successful Vercel deployment.

| Urgency | Warning                                                                   | Assessment and action                                                                                                                                                                      |
| ------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| High    | `engines.node: >=22` permits an automatic future major                    | Fixed by pinning `22.x`, matching CI and preventing an unreviewed Vercel runtime jump.                                                                                                     |
| Medium  | `@testing-library/jest-dom` 6.10.x was withdrawn/deprecated               | Fixed by pinning 6.9.1, the upstream-recommended 6.x release. It is test-only and did not affect the production bundle.                                                                    |
| Medium  | ESLint 9 is end-of-life                                                   | Open maintenance item. ESLint 10 cannot be adopted until the accessibility plugin's published peer range supports it. Keep accessibility linting enabled.                                  |
| Low     | `glob@7`, `inflight`, `uuid@7`, `whatwg-encoding`, `abab`, `domexception` | Transitive development dependencies from Expo/Jest tooling. The lockfile audit reports zero known vulnerabilities. Resolve through a tested Expo/Jest upgrade rather than risky overrides. |

These warnings are maintenance signals, not evidence that the deployed application failed. Re-run `npm audit`, all workspace tests, the Android bundle check, and the Vercel production build when upgrading Expo/Jest or ESLint.

Supabase's post-migration advisor also reports leaked-password protection disabled (medium operational priority) and older missing-index/no-primary-key observations. The new task-template creator foreign key is indexed. `task_templates` intentionally has RLS with no direct policies because all direct table privileges are revoked and the household-scoped read RPC is the only read surface.
