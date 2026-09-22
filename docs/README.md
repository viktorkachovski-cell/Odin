# Odin documentation

Odin is a shared household task app: an Expo Android client, a Vite React web
client on Vercel, and a Supabase Postgres backend. All three are implemented
and in production.

Files are named for the question they answer. There is no reading order
implied by the filenames — this index is the order.

## Start here

| Read                | For                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `architecture.md`   | The stack, repository layout, backend boundaries, state and reliability rules                |
| `decisions.md`      | What the product does and does not do, what is settled, what is still open                   |
| `contract.md`       | The shared data model, read API, command envelope and error codes                            |
| `code-standards.md` | How to write and check code here, and which gates must pass                                  |
| `known-risks.md`    | What is currently broken, unproven or deliberately accepted — read before promising anything |

Those five are the prerequisites for any change. `AGENTS.md` at the repository
root says the same and adds the working rules.

## Then, by area

| Area                  | File                     | Contains                                                                    |
| --------------------- | ------------------------ | --------------------------------------------------------------------------- |
| What the app does     | `features.md`            | Lists, tasks, both template types, notes, deletion, client compatibility    |
| Database              | `database.md`            | Authorization design, invariants, index baseline, test layout               |
| Web client            | `web.md`                 | Desktop layout, interaction rules, authentication, security headers         |
| Android client        | `android.md`             | Stack, what is shared, Android specifics, presentation, build config        |
| Deploying             | `operations.md`          | Environments, database and Vercel procedure, Auth config, dependency triage |
| What was deployed     | `deployment-log.md`      | Append-only production record: migrations, smoke runs, advisor findings     |
| What is proven        | `verification.md`        | CI coverage, requirements traceability, edge cases, release gates           |
| Original requirements | `source-requirements.md` | Verbatim FR/BR transcription, referenced by the traceability matrix         |

Working database detail — file order, local workflow, the RPC and grant matrix
— lives in `supabase/README.md`, next to the SQL.

## Keeping these current

- A change that opens, closes or changes the severity of a risk updates
  `known-risks.md`. Do not work an entry there unless asked.
- A change that reaches the hosted project appends to `deployment-log.md`.
- A change to behaviour updates `features.md`; a change to the API updates
  `contract.md` with a compatibility note and both clients.
- A settled question moves out of `decisions.md`'s open list with a date,
  rather than being deleted.
