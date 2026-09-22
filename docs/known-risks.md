# Known risks

One place to see what is currently wrong, unproven or deliberately accepted in
Odin, so nobody has to reconstruct it from nine other files. Opened
2026-09-22.

Each entry says what could actually go wrong, not just what is missing. An
entry leaves this file when it is fixed or when the owner accepts it, and
"accepted" means it moves to the last section rather than disappearing.

Nothing here is a to-do list for the next agent to pick up unprompted. Work an
entry when the owner asks for it.

## Open

### R1 — Email confirmation and recovery cannot be delivered

**Severity: high. Blocks new members joining.**

SMTP is not configured on the hosted project, so no confirmation or recovery
mail leaves it. A new member can register and then get stuck: the account
exists, the confirmation link never arrives, and sign-in refuses an
unconfirmed email. Password recovery is dead for the same reason.

Every automated test around this mocks the auth call. None of them is evidence
that mail arrives. Choosing the SMTP sender and provider is still an open item
in `docs/decisions.md`.

The Auth configuration this depends on is in `docs/operations.md`.

### R2 — Archived lists and templates are invisible and unrecoverable from the app

**Severity: medium, and growing.**

"Delete list" archives rather than deletes, and since 2026-09-22 that covers
templates too (`docs/features.md`). Nothing in either client can
list, restore or purge an archived row, so the only way back is an operator
with database access running SQL by hand.

Two consequences. A member who archives the wrong list has no self-service
recovery. And archived lists and their tasks accumulate forever, now faster
than before, with no retention story.

A restore view, or a `restore_list` command plus a purge policy, would close
it. Neither exists.

### R3 — Three contract races are untested

**Severity: medium.**

`npm run db:test:concurrency` runs in CI against a real local stack, but three
races named in `docs/contract.md` have no coverage:

1. An assignment racing the assignee's membership revocation.
2. Two concurrent `create_household` calls for one account.
3. Two accounts redeeming one invitation simultaneously.

Each is a correctness claim the contract makes and the suite does not check. A
regression in any of them would ship silently.

Recorded in `supabase/README.md`.

### R4 — Previews read and write production data

**Severity: medium. Accepted in principle, still a live hazard.**

Odin runs one hosted Supabase project, deliberately (`docs/architecture.md`).
Every Vercel preview deployment therefore points at production. A preview of a
branch with a destructive bug operates on real household data, and there is no
staging copy to catch it first.

This is why every verification script in `supabase/smoke/` wraps itself in a
transaction that is forced to roll back, and why `supabase db reset` must never
be aimed at the hosted project.

### R5 — Legacy RPCs have no deprecation plan

**Severity: low, rising slowly.**

`create_list`, `update_list`, `create_task` and `update_task` are kept callable
and note-preserving so installed Android builds keep working, with `*_v2`
carrying the note-aware behaviour. Nothing records when they can be removed, or
how to find out whether any install still calls them.

Every future field on a list or task faces the same fork, so the surface grows
each time. A reading of `private.command_receipts` by `command_name` would show
whether the legacy pair is still in use.

Recorded in `docs/deployment-log.md` and
`docs/features.md`.

### R6 — Database backups contain the invitation signing key

**Severity: low, sharp edge.**

`private.system_secrets` holds a random HMAC key generated inside the database,
used to rederive invitation tokens for idempotent retries. Any backup of the
project therefore contains it and must be protected as a secret, not as
ordinary data. Rotating the key invalidates every outstanding invitation and
needs a deliberate procedure that is not written down anywhere.

Recorded in `supabase/README.md`.

### R7 — No membership exit, removal or account deletion

**Severity: low for now, blocking for release.**

`docs/decisions.md` item 3 is unresolved, so no UI exposes removal and no
policy exists for a member leaving or an account being deleted. The schema
handles an inactive membership, but nothing exercises what happens to that
member's assigned tasks, and equal permissions mean no member has authority to
expel another anyway.

### R8 — Web bundle is one ~570 kB chunk

**Severity: low.**

No code splitting; the whole app loads up front. Fine on a desktop connection,
noticeable on a slow phone. Last measured at about 580 kB of JavaScript
before gzip, 165 kB gzipped; Vite reports it as a non-blocking warning on
every build. It grew by roughly 12 kB on 2026-09-22: the notification rules
and strings are shared packages, so the web bundle carries them even though
only Android notifies.

### R9 — Notification delivery is partial and unverified

**Severity: medium. The feature works less than its description suggests.**

Notifications (`docs/features.md`) are delivered by the device, because remote
push needs FCM credentials and a sender that do not exist
(`docs/decisions.md`, open decision 7). Three consequences follow.

A task becoming yours, or one of yours being edited, is only announced while
Odin's process is alive — foreground or recently backgrounded. Once Android
kills the process, nothing is announced until the member next opens the app,
and the baseline is then re-taken silently, so the change is never announced at
all. This is the notification people would most expect to get, and it is the
one least likely to arrive.

Deadline reminders are held by Android's alarm service and do fire with the app
closed, but they are scheduled inexactly. Doze can delay one past the moment it
describes, so a "due in 1 hour" reminder can arrive rather less than an hour
before.

A reminder can also outlive the work. Reminders are reconciled only while the
app runs, so if another member completes or reschedules a dated task while
Odin is closed, the alarm Android already holds still fires. The member is
reminded about something already done, until the app next opens and
reconciles.

None of it has run on a device. The Jest suite drives an in-memory double of
`expo-notifications`, which proves the decision logic and the reconciliation
and proves nothing about Android actually posting, scheduling or waking. This
is the general device gap in the accepted section below, but it lands harder
here than elsewhere: every other Android feature at least renders in a test
renderer, while notification delivery has no non-device evidence at all.

Closing it means either the push work in open decision 7, or a device pass.

## Accepted, not tracked

These are real, known, and deliberately not being worked. They are here so
silence is not mistaken for "handled".

| Item                                         | Status                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Android device verification**              | **Deferred by owner decision, 2026-09-22.** No Odin build has run on an emulator or a physical device. Everything Android is proven by Jest, typecheck, Expo Doctor and a production export only. The factual records in `docs/android.md` and `docs/verification.md` stand; this is no longer tracked as a risk to act on. Revisit before any release claim or store listing. |
| **A new household starts with no templates** | **Intended, settled 2026-09-22.** Not a gap. A household builds its own templates by saving a list it actually uses. See `docs/decisions.md` item 4 and the seed-content note in `supabase/README.md`.                                                                                                                                                                         |
| **One hosted environment**                   | Deliberate for a private single-owner project. The operational hazard it creates is R4, which stays open.                                                                                                                                                                                                                                                                      |
