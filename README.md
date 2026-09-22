# Odin

A shared household task app. Any member of a household can create lists, add
tasks, assign or claim them, and mark them done; everyone has the same
permissions. It runs as an Expo Android client and a Vite React web client on
Vercel, over a Supabase Postgres backend, in English and Bulgarian.

All three are implemented and in production. The web client is at
`https://odin-ten-tau.vercel.app`.

## Documentation

**[`docs/README.md`](docs/README.md) is the index.** It says what to read and
in what order.

Before changing anything, read [architecture](docs/architecture.md),
[decisions](docs/decisions.md), [the API contract](docs/contract.md),
[code standards](docs/code-standards.md) and
[known risks](docs/known-risks.md). `AGENTS.md` adds the working rules.

## Running the checks

Node 22.

```sh
npm ci --ignore-scripts
npm run check
```

`check` covers ESLint, formatting, every workspace typecheck, the linter
regression tests, Vitest and Android Jest. `npm run build` produces the web
bundle. The database scripts need Docker and are listed in
[`supabase/README.md`](supabase/README.md); CI runs them on every push.

What the checks prove, and what they do not, is in
[verification](docs/verification.md).

## Boundaries

Odin's Supabase project and Vercel project are its own. Never reuse or modify
the Passport database or the LARP Vercel project, and never aim a reset at a
hosted project.

Odin runs a single hosted environment by owner decision, so previews read and
write production data. See [operations](docs/operations.md).
