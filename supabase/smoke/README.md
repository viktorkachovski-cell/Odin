# Production-safe smoke scripts

Run by hand against a hosted database to prove a deployment, not by
`supabase test db`.

Each script opens a transaction, creates synthetic users and a synthetic
household, exercises the commands, and rolls everything back. They never read
or change existing household content.

```sh
psql "$ODIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/smoke/lifecycle-smoke.sql
```

They assert by raising an exception inside `do $$ … $$` blocks, so a failure
aborts the transaction and `psql` exits non-zero. That is deliberately **not**
pgTAP: they declare no `plan()` and emit no TAP output.

That is also why they live here rather than under `supabase/tests/`. The CLI
collects every `.sql` in that tree and hands it to `pg_prove`, which fails a
file that produces no TAP plan — `No plan found in TAP output`. A plan-less
script placed there turns the Database workflow red without any test actually
failing, which is what happened between `e97c950` and `cfadd7d`.

`tooling/tests/database-static.test.mjs` guards the boundary: every `.sql`
under `supabase/tests/` must declare a plan. Adding a smoke script here needs
no change to it.
