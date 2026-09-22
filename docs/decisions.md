# Product decisions and boundaries

## Confirmed by the user in this task

| Topic               | Decision                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| Launch              | Android and desktop web                                                                                 |
| Languages           | English and Bulgarian                                                                                   |
| Sign-in             | Email registration, confirmation link and password login on both clients; see `web.md` and `android.md` |
| Invitations         | Any household member may invite through an expiring link                                                |
| Backend and hosting | Supabase Postgres; Vercel desktop website                                                               |
| Task deadline       | Date may omit time; date-only resolves to 23:59:59.999 in the user's local time zone                    |
| Task text           | Task title 1–500 Unicode code points; shared notes up to 5,000 editable by any household member         |
| Task templates      | Any member may save title and notes; applying a template resets assignee, deadline and completion       |

## Confirmed by the source requirements

One active household per account in MVP; equal task permissions for every member; at most one task assignee; deadlines only on tasks. Any member may create, assign, reassign, claim, complete or reopen tasks. Template copying copies text/order only and resets ownership, deadlines and completion. Templates and active lists remain independent.

Home keeps bordered template cards and unbordered active cards in separately labeled sections. The question-mark control opens Unassigned, the person control opens My Tasks, and scrolling hides/reveals the bottom navigation. My Tasks and Unassigned exclude completed/template tasks. Empty-list progress is 0 percent.

## Proposed implementation defaults

These fill technical gaps without redefining confirmed task rules. Record deviations before implementation; do not silently treat proposed lifecycle policy as approved product scope.

| Topic                 | Proposed default and consequence                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| New household         | A signed-in account with no active household may create one or redeem an invitation; no public household directory                 |
| Invitation lifetime   | 72 hours, one redemption, opaque high-entropy token stored only as a hash; expired/revoked/used links cannot join                  |
| Invitation recipient  | Bearer link usable by a signed-in person; not email-bound; show household name only after secure token validation                  |
| Invitation revocation | Creator may revoke their outstanding invitations; broader moderation remains undecided                                             |
| Email delivery        | Custom SMTP required for general-user confirmation and recovery email delivery; preserve default confirmation/reset link templates |
| Task time             | Optional local date and time converted to UTC; date-only tasks resolve to local end of day                                         |
| Text limits           | List title 1–160; task title 1–500; notes 5,000; subtitle 300; display name 1–80 Unicode code points                               |
| List task ordering    | Append at end, stable ordering; no drag-and-drop editing in MVP                                                                    |
| Avatars               | Initials and deterministic accessible colors satisfy fallback requirement; uploads deferred                                        |
| Templates             | Superseded 2026-09-22: no seed content. A household saves its own list templates; see item 4 below and `features.md`               |
| Seed selection        | Household chooses seed language during creation; UI language changes never translate existing user content                         |
| Offline               | Visible stale data and retained in-session drafts; no automatic offline write queue                                                |
| Sorting               | My Tasks: due timestamp ascending, nulls last, then stable list/task ID tie-breaker; Unassigned uses same deterministic sort       |

## Decisions still required before release

1. Approve invitation lifetime, bearer-link behavior and onboarding defaults above; expiry value can be configuration, not hardcoded in clients.
2. ~~Select Odin Supabase organization/region/plan and staging/production budget~~ — **settled 2026-09-20**: one hosted environment, the `mvltbhtsukorspmpyhpw` project in eu-central-1, treated as production (see `architecture.md`). Still open: select the SMTP sender and provider. No reuse of LARP resources.
3. Decide member removal/household exit, account deletion and recovery policy. Equal task permissions do not imply authority to expel people. Until approved, do not expose removal UI. Backend design must still handle revoked membership safely.
4. ~~Approve list-template seed titles/content in both languages~~ — **settled 2026-09-22**: there is no seeded content. A new household starts with no templates and builds its own by saving a list it uses, which is why `save_list_template` exists. `private.seed_lists`/`private.seed_tasks` remain in the schema only so the decision stays reversible. Household task-template creation is implemented separately.
5. Choose Android distribution (private APK initially or Play Store), package identifier, signing ownership and exact supported Android/browser versions after Expo selection.
6. Decide whether children need accounts without email. Email registration assumes each member can receive email; agents must not invent shared logins or child/guardian roles.
7. Decide whether notifications should also be delivered remotely. The
   amendment below ships device-local delivery, which cannot reach a phone
   whose Odin process Android has killed. Remote push needs FCM credentials on
   the EAS project, a sender the database can reach and a scheduled sweep for
   deadlines; none of that exists, and the EAS project ID added on 2026-09-22
   is only the first of those pieces.

### Open product questions carried from the UI review

These alter confirmed behaviour, so they need a decision rather than an agent's
judgement:

- **Persistent desktop navigation.** Better for mouse and keyboard than
  hide-on-scroll, and currently shipped on desktop while narrow viewports keep
  the source behaviour. Recorded as an adaptation, pending approval.
- **Hide-on-scroll navigation** can make navigation harder to find. Consider
  always-visible navigation as a later tested revision; at minimum review the
  focus and reduced-motion accommodations. Android already keeps the bar
  visible under system reduce-motion, which is an accessibility accommodation
  recorded for review rather than applied silently.
- **Collapsing completed tasks** would shorten long lists but must keep them
  discoverable and in the totals. The source's visible completed group is the
  default until approved.
- **FR 27 read-only template preview** is optional and unimplemented. It must
  never block Must scope, and tapping Copy must never also trigger preview.
- **Rewards, streaks or fairness rankings** are excluded. They change what the
  product is and need their own discussion, not an implementation decision.

## Authentication amendment — 2026-09-21

The owner requested email registration and password login on the Vercel app, followed by the Android implementation. This supersedes the original web OTP decision. Confirm email remains enabled. Confirmation links establish a session; subsequent sign-ins use email/password. Password recovery also lets existing OTP users set a password without replacing their account. New passwords require at least eight characters; existing passwords are never rejected by new client-side registration rules at login.

Shared APIs were added, the old mobile OTP API and translations were preserved for installed builds, and the Android password screens shipped. No household rule or database identity changed.

Automatic recurrence, threaded comments, attachments, subtasks, calendars, rewards and a cross-household admin panel are outside this MVP. Notifications left that list on 2026-09-22 — see the amendment below. Tasks have one shared editable notes field, not an authored discussion thread.

List and task removal, mentioned in BR 10 but originally deferred, was approved on 2026-09-21 and extended to templates on 2026-09-22. Deleting a list of either kind archives it; deleting a task removes it. See `features.md`.

## Notification amendment — 2026-09-22

The source requirements excluded "automatic recurrence and notification rules
**until the product owner selects their behavior**", and left a matching open
decision row. The owner selected it on 2026-09-22, so notifications are in
scope for the Android client. `code-standards.md` still forbids _inventing_
notifications; this is an instruction, not an invention.

| Topic           | Decision                                                                                       |
| --------------- | ---------------------------------------------------------------------------------------------- |
| Triggers        | A task becomes yours; a task of yours is changed; a deadline approaches                        |
| Deadline ladder | 24 hours, then 4 hours, then 1 hour before the deadline                                        |
| Deadline scope  | Tasks assigned to you **and** unassigned tasks, so dated work nobody has claimed is not missed |
| Change scope    | Tasks assigned to you only                                                                     |
| Gate            | Android's own permission **and** a per-device mute the member controls; both must allow it     |
| Platform        | Android only. The web client is untouched and gains no notification behaviour                  |
| Delivery        | Device-local. Deferred: remote push (open decision 7)                                          |

"Imminent" was left undefined in the request and the owner chose one hour.

Delivery is local to the device because remote push cannot be built here:
Expo push needs FCM credentials uploaded to the EAS project and a sender the
database can reach, neither of which exists. The consequence is deliberate and
is recorded as risk R9 in `known-risks.md` — Android holds the deadline
reminders and fires them with Odin closed, but a task becoming yours is only
announced while the Odin process is alive.

Nothing in the shared contract changed. Both triggers are derived from
`getMyTasks` and `getUnassigned`, whose per-task `version` the contract already
increments once per change, so no schema, RPC, DTO or error code moved and the
two clients did not need coordinating.
