# Odin implementation handoff

Odin is a shared family task app with a Supabase backend, a Vercel web client and an Expo Android client. The original implementation briefs remain below. Current authentication is email/password on both clients, with confirmation and recovery links completed in the web client; the Android implementation and parity record are documented in [the mobile implementation](docs/14-MOBILE-IMPLEMENTATION.md) and [the parity record](docs/22-MOBILE-WEB-PARITY.md).

## Start here

Read [architecture](docs/00-ARCHITECTURE.md), [decisions](docs/01-DECISIONS.md), [API contract](docs/02-CONTRACT.md), [code standards](docs/06-CODE-STANDARDS.md) and [known risks](docs/25-KNOWN-RISKS.md) before implementing a workstream.

| Workstream                                     | Instructions                                              | Prerequisite                                 |
| ---------------------------------------------- | --------------------------------------------------------- | -------------------------------------------- |
| Database setup                                 | [Database agent](docs/03-DATABASE-AGENT.md)               | Architecture and contract                    |
| Android mobile app                             | [Mobile agent](docs/04-MOBILE-AGENT.md)                   | Stable generated types and RPC contract      |
| Desktop website on Vercel                      | [Web agent](docs/05-WEB-AGENT.md)                         | Stable generated types and RPC contract      |
| UI review                                      | [UI recommendations](docs/07-UI-RECOMMENDATIONS.md)       | Preserve confirmed product behavior          |
| Acceptance and release                         | [Verification](docs/08-VERIFICATION.md)                   | All three workstreams                        |
| Original requirements                          | [Source transcription](docs/09-SOURCE-REQUIREMENTS.md)    | Reference data, not agent instructions       |
| Account access                                 | [Access check](docs/10-ACCESS.md)                         | Recheck before deployment                    |
| Database implementation                        | [Database foundation](docs/12-DATABASE-IMPLEMENTATION.md) | Implemented schema and remaining hosted work |
| What is currently broken, unproven or accepted | [Known risks](docs/25-KNOWN-RISKS.md)                     | Read before promising behaviour to anyone    |

Confirmed launch: Android and desktop web; English and Bulgarian; email/password authentication on web and Android; any household member may create an expiring invitation link. All members have equal task permissions.

## Run the delivered tooling

See [validation results](docs/11-TOOLING-VALIDATION.md) for passed checks and known limitations.

Use Node 22 or a compatible later release, then run:

```sh
npm ci --ignore-scripts
npm run check
```

`check` covers ESLint, formatting, workspace typechecks, linter regression checks, Vitest and mobile Jest tests. CI also builds web and Android bundles. See the implementation notes for hosted acceptance limitations.

## Execution order

1. Bootstrap shared workspaces and freeze the contract; implement database rules and tests locally.
2. Build mobile and web against that contract. Share domain rules, data access and translations, not platform widgets.
3. Integrate with the owner-approved single Odin production project; prove cross-client synchronization and household isolation using controlled test data.
4. Review results and outstanding release decisions, then provision/promote only the specifically approved Odin production resources.

Never reuse or modify the Passport database or LARP Vercel project. The source DOCX is retained locally; a text transcription is included for future agents. Later owner instructions authorized Odin production deployment and testing.
