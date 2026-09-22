# Restoring the Odin web client work

The session container could not push to GitHub (HTTP 403 — the Claude GitHub App
has no access to `viktorkachovski-cell/Odin` for the organization), so the work
is handed over as a git bundle instead. Nothing is lost: the bundle carries the
full history, all 10 commits including the `database-foundation` merge.

## Option A — you already have the repo cloned

```sh
cd /path/to/Odin
git fetch /path/to/odin-web-client.bundle vikc/serene-goldberg-u8geqs:vikc/serene-goldberg-u8geqs
git checkout vikc/serene-goldberg-u8geqs
git push -u origin vikc/serene-goldberg-u8geqs
```

## Option B — fresh clone straight from the bundle

```sh
git clone --branch vikc/serene-goldberg-u8geqs /path/to/odin-web-client.bundle Odin
cd Odin
git remote set-url origin https://github.com/viktorkachovski-cell/Odin
git push -u origin vikc/serene-goldberg-u8geqs
```

## Verify it arrived intact

```sh
git log --oneline -11
npm ci
npm run check      # lint, format, typecheck, 6 tooling tests, 88 unit/component tests
```

Expected head: `fc941ae fix: add an inline favicon so the sign-in page loads without a 404`

## Branch contents

Ten commits on top of `main`:

- `a5a86f3` … `d658667` — the existing `database-foundation` work, merged in
  unchanged with its history intact.
- `00ca998` — web client, shared packages and tooling (this also contained a
  parallel database schema, removed in the next commit).
- `0a68991` — removes that duplicate schema so there is one canonical database.
- `66a9911` — merge of `database-foundation`.
- `38d1088` — retargets the client at that schema's actual RPC surface.
- `fc941ae` — inline favicon.

## Unblocking the push for future sessions

Install the Claude GitHub App on the repository:
https://github.com/apps/claude/installations/select_target

or reconnect GitHub from claude.ai settings:
https://claude.ai/customize/connectors?auth_start=github&auth_start_force=1

The same gap is already recorded in `docs/operations.md` from the planning pass.
The Vercel connection is separately read-only: creating the hosting project
returned 403 `forbidden`, so no preview deployment exists yet.
