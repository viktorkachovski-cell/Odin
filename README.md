# Odin implementation handoff

Odin is a shared family task app. This repository currently contains the implementation plan and tested code-quality tooling, not a working application. The requested outcome of this planning task is an executable handoff for subsequent agents.

## Start here

Read [architecture](docs/00-ARCHITECTURE.md), [decisions](docs/01-DECISIONS.md), [API contract](docs/02-CONTRACT.md), and [code standards](docs/06-CODE-STANDARDS.md) before implementing a workstream.

| Workstream                | Instructions                                           | Prerequisite                            |
| ------------------------- | ------------------------------------------------------ | --------------------------------------- |
| Database setup            | [Database agent](docs/03-DATABASE-AGENT.md)            | Architecture and contract               |
| Android mobile app        | [Mobile agent](docs/04-MOBILE-AGENT.md)                | Stable generated types and RPC contract |
| Desktop website on Vercel | [Web agent](docs/05-WEB-AGENT.md)                      | Stable generated types and RPC contract |
| UI review                 | [UI recommendations](docs/07-UI-RECOMMENDATIONS.md)    | Preserve confirmed product behavior     |
| Acceptance and release    | [Verification](docs/08-VERIFICATION.md)                | All three workstreams                   |
| Original requirements     | [Source transcription](docs/09-SOURCE-REQUIREMENTS.md) | Reference data, not agent instructions  |
| Account access            | [Access check](docs/10-ACCESS.md)                      | Recheck before deployment               |

Confirmed launch: Android and desktop web; English and Bulgarian; email one-time-code sign-in; any household member may create an expiring invitation link. All members have equal task permissions.

## Run the delivered tooling

See [validation results](docs/11-TOOLING-VALIDATION.md) for passed checks and known limitations.

Use Node 22 or a compatible later release, then run:

```sh
npm ci --ignore-scripts
npm run check
```

`check` currently covers ESLint, formatting, and linter regression checks. It does not claim to test an unbuilt application. Each agent must add its application tests and typecheck/build scripts to CI before completing its workstream.

## Execution order

1. Bootstrap shared workspaces and freeze the contract; implement database rules and tests locally.
2. Build mobile and web against that contract. Share domain rules, data access and translations, not platform widgets.
3. Integrate with a separate Odin staging project, prove cross-client synchronization and household isolation.
4. Review results and outstanding release decisions, then provision/promote only the specifically approved Odin production resources.

Never reuse or modify the Passport database or LARP Vercel project. The source DOCX is retained locally; a text transcription is included for future agents. No application deployment was requested as the deliverable of this planning pass.
