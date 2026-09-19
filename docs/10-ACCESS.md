# Access verification

Checked September 19, 2026 through live connected tools.

| Service          | Verified result                                                                                              | Meaning                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Supabase         | Authenticated project listing succeeded; visible project is Passport                                         | Read access confirmed; no Odin project exists in the returned list; creation/apply permissions were not tested by mutation |
| Vercel           | Authenticated team/project listings succeeded; visible project is larp-passport                              | Read access confirmed; no Odin hosting project exists in the returned list; deployment permission not tested               |
| GitHub           | `viktorkachovski-cell/Odin` metadata retrieved; public, size 0, default main; push/admin permission reported | Repository available for requested handoff upload; publication result recorded separately                                  |
| Local GitHub CLI | `gh auth status` failed for stored credential; Git remote request also hit sandbox network proxy restriction | CLI path unusable in this session; connected GitHub tools remain authenticated                                             |

Follow-up publication checks: the connected GitHub write tool returned HTTP 403 despite repository permissions. Outside the sandbox, local GitHub CLI authentication succeeded and Git fetched the repository. The remote contained an initial README commit; it was inspected before integrating the handoff. The earlier CLI credential failure was sandbox-dependent, not proof that the stored credential was invalid. Publication uses the working local Git credentials.

No Supabase schema/data mutation or Vercel deployment was performed during planning. No project URLs, project keys, household content or personal email addresses are needed in these public briefs. GitHub upload is explicitly requested by the user; do not confuse that with production app deployment approval.

Before provisioning, select Odin organization, region, staging/production arrangement and cost. Use new Odin resources rather than changing Passport. Recheck current access then; a read-only list call does not guarantee every administrative operation will succeed.
