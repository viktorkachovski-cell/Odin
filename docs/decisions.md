# Product decisions and boundaries

## Confirmed by the owner

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

Scrolling hides/reveals narrow web navigation. Android's navigation stays visible by the 2026-10-13 amendment below. The Mine and Unassigned views exclude completed/template tasks. Empty-list progress is 0 percent. The source Home screen and its question-mark/person controls were replaced on 2026-10-11; see below.

Outside this MVP: automatic recurrence, threaded comments, attachments, subtasks, calendars, rewards and a cross-household admin panel. Tasks have one shared editable notes field, not an authored discussion thread. Notifications left this list on 2026-09-22 and list/task removal on 2026-09-21; see the amendments below.

## Task workflow — confirmed 2026-09-27

The owner requested task details, up/down movement for tasks and lists,
deadline filtering across all tasks, four task statuses, and mobile visual
polish that retains Odin's palette.

The owner confirmed that Unassigned follows assignment automatically, order is
shared across household members, and date filters refer to task deadlines.
Blocked and Done are explicit choices. Task movement preserves the existing
incomplete-first groups; list movement is within the existing active/template
sections. New tasks and lists still append before a member moves them. No list
deadline, multi-assignee, permission hierarchy or template runtime state is
introduced.

Implementation choices, with their tradeoffs in `known-risks.md`: the stored
lifecycle is Open/Blocked/Done, and Unassigned and To-do are display labels
derived from assignment, never command input. Lists, list detail and the
cross-list task reads each return one snapshot; a view above 1,000 rows fails
visibly instead of truncating (R10).

## Navigation and task views — confirmed 2026-10-11

The owner approved the client overhaul shipped on 2026-10-11, which amends the
source Home and navigation (FR 03–04, FR 21):

- Four destinations on both clients: Today, Tasks, Lists and Settings. Today
  and the Tasks register (Mine / Unassigned / Everyone) replace Home, My Tasks,
  Unassigned and All Tasks; the old routes redirect.
- Templates live on their own Lists tab rather than as bordered cards above the
  active lists; each is still visibly a template and is used through Use
  template.
- List detail collapses completed tasks behind a count. They stay in the
  totals and one tap away. This settles the open question below.
- Reordering is an explicit mode; saving a list as a template moved from an
  icon beside the title into the list's menu.

Hide-on-scroll navigation on narrow web and Android is unchanged.

## Android design review — approved 2026-10-13

The owner selected Android only, retained the ivory/oak/green palette, reviewed
`design-preview/odin-mobile-review.html`, and approved implementation, testing
and deployment. This supersedes Android's hide-on-scroll choice above:

- Four persistent Android tabs, with safe-area and large-text space shared by
  the tabs, floating create action and list quick add.
- A Filters sheet replaces the horizontal Android deadline rail. Selection
  applies explicitly, cancellation discards changes, and active filters can be
  cleared. The filter meanings and shared calculations are unchanged.
- Title and parent list lead new-task entry; optional details and task-template
  actions expand together. Existing tasks open expanded, and hidden invalid
  fields reopen automatically. Draft/conflict behavior remains intact.
- Separate task cards and clearer metadata trade density for easier scanning.
  Task notes remain editable/searchable rather than appearing in every row.

The release follows the existing installable private APK route under
`app.odin.household`, using EAS-managed signing and the production profile and
environment. No Play Store listing, new application identity, permission model,
backend contract or web layout was requested. The device verification gap
remains recorded in `known-risks.md`.

## Task housekeeping — confirmed 2026-10-14

The owner asked for three changes and confirmed their meaning:

- **Chronological order.** Cross-list views keep deadline ascending with
  undated last, and break ties by creation time, oldest first, then task ID.
  The previous list-ID tie-breaker made undated tasks look shuffled. List
  detail keeps its shared manual order.
- **Batch delete of done tasks** works on one list at a time, never across the
  household, so a member cannot purge every list by accident. It deletes only
  the done tasks the member saw, behind a confirmation, all or nothing.
- **Avatar colours** must tell members apart when they share initials. Hues
  are now spread evenly across the household's members instead of hashed into
  twelve slots, where two members collided one time in twelve.

Multiple assignees and shared claims were raised in the same request and
deferred by the owner; the one-assignee rule is unchanged.

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
| Drag-and-drop         | Confirmed up/down actions set shared order; drag-and-drop is not implemented                                                       |
| Avatars               | Initials and accessible colors unique within the household (amended 2026-10-14); uploads deferred                                  |
| Templates             | Superseded 2026-09-22: no seed content. A household saves its own list templates; see item 4 below and `features.md`               |
| Seed selection        | Household chooses seed language during creation; UI language changes never translate existing user content                         |
| Offline               | Visible stale data and retained in-session drafts; no automatic offline write queue                                                |
| Sorting               | Cross-list views: due timestamp ascending, nulls last, then oldest created first, then task ID (amended 2026-10-14)                |

## Decisions still required before release

1. Approve invitation lifetime, bearer-link behavior and onboarding defaults above; expiry value can be configuration, not hardcoded in clients.
2. ~~Select Odin Supabase organization/region/plan and staging/production budget~~ — **settled 2026-09-20**: one hosted environment, the `mvltbhtsukorspmpyhpw` project in eu-central-1, treated as production (see `architecture.md`). Still open: select the SMTP sender and provider. No reuse of LARP resources.
3. Decide member removal/household exit, account deletion and recovery policy. Equal task permissions do not imply authority to expel people. Until approved, do not expose removal UI. Backend design must still handle revoked membership safely.
4. ~~Approve list-template seed titles/content in both languages~~ — **settled 2026-09-22**: there is no seeded content. A new household starts with no templates and builds its own by saving a list it uses, which is why `save_list_template` exists. `private.seed_lists`/`private.seed_tasks` remain in the schema only so the decision stays reversible. Household task-template creation is implemented separately.
5. **Private APK route retained for the 2026-10-13 approval:** existing package `app.odin.household` and existing EAS-managed signing. Still open: Play Store distribution, signing ownership policy and the exact tested Android/browser matrix.
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
- **Hide-on-scroll navigation on narrow web** remains open for review.
  **Android settled 2026-10-13:** persistent tabs, as approved above.
- ~~**Collapsing completed tasks**~~ — **settled 2026-10-11**: list detail
  collapses them behind a count, kept in the totals (see above).
- **FR 27 read-only template preview** is optional and unimplemented. It must
  never block Must scope, and tapping Copy must never also trigger preview.
- **Rewards, streaks or fairness rankings** are excluded. They change what the
  product is and need their own discussion, not an implementation decision.

## Authentication amendment — 2026-09-21

The owner requested email registration and password login on the Vercel app, followed by the Android implementation. This supersedes the original web OTP decision. Confirm email remains enabled. Confirmation links establish a session; subsequent sign-ins use email/password. Password recovery also lets existing OTP users set a password without replacing their account. New passwords require at least eight characters; existing passwords are never rejected by new client-side registration rules at login.

Shared APIs were added and the Android password screens shipped. No household rule or database identity changed. The client one-time-code helpers, their strings and Android's `/verify-code` redirect were removed on 2026-10-11 by owner decision: installed builds bundle their own copy, so the repository copy served no one. Accounts created under the code flow still gain a password through Forgot password.

## Removal — 2026-09-21

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

Nothing in the shared contract changed: both triggers are derived from
`getMyTasks` and `getUnassigned`, whose per-task `version` the contract already
increments once per change.
