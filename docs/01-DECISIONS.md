# Product decisions and boundaries

## Confirmed by the user in this task

| Topic               | Decision                                                                                                                          |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Launch              | Android and desktop web                                                                                                           |
| Languages           | English and Bulgarian                                                                                                             |
| Sign-in             | Email registration, confirmation link and password login on web; mobile migration specified in `16-MOBILE-PASSWORD-AUTH-AGENT.md` |
| Invitations         | Any household member may invite through an expiring link                                                                          |
| Backend and hosting | Supabase Postgres; Vercel desktop website                                                                                         |
| Task deadline       | Date may omit time; date-only resolves to 23:59:59.999 in the user's local time zone                                              |
| Task text           | Task title 1–500 Unicode code points; shared notes up to 5,000 editable by any household member                                   |
| Task templates      | Any member may save title and notes; applying a template resets assignee, deadline and completion                                 |
| Deliverable now     | Markdown execution briefs, linter and handling rules, uploaded to Odin on GitHub                                                  |

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
| Templates             | Versioned, reviewed English/Bulgarian seed content copied into each household; immutable in normal client UI                       |
| Seed selection        | Household chooses seed language during creation; UI language changes never translate existing user content                         |
| Offline               | Visible stale data and retained in-session drafts; no automatic offline write queue                                                |
| Sorting               | My Tasks: due timestamp ascending, nulls last, then stable list/task ID tie-breaker; Unassigned uses same deterministic sort       |

## Decisions still required before release

1. Approve invitation lifetime, bearer-link behavior and onboarding defaults above; expiry value can be configuration, not hardcoded in clients.
2. ~~Select Odin Supabase organization/region/plan and staging/production budget~~ — **settled 2026-09-20**: one hosted environment, the `mvltbhtsukorspmpyhpw` project in eu-central-1, treated as production (see `00-ARCHITECTURE.md`). Still open: select the SMTP sender and provider. No reuse of LARP resources.
3. Decide member removal/household exit, account deletion and recovery policy. Equal task permissions do not imply authority to expel people. Until approved, do not expose removal UI. Backend design must still handle revoked membership safely.
4. ~~Approve list-template seed titles/content in both languages~~ — **settled 2026-09-22**: there is no seeded content. A new household starts with no templates and builds its own by saving a list it uses, which is why `save_list_template` exists. `private.seed_lists`/`private.seed_tasks` remain in the schema only so the decision stays reversible. Household task-template creation is implemented separately.
5. Choose Android distribution (private APK initially or Play Store), package identifier, signing ownership and exact supported Android/browser versions after Expo selection.
6. Decide whether children need accounts without email. Email registration assumes each member can receive email; agents must not invent shared logins or child/guardian roles.

## Authentication amendment — 2026-09-21

The owner requested email registration and password login on the Vercel app, followed by the Android implementation. This supersedes the original web OTP decision. Confirm email remains enabled. Confirmation links establish a session; subsequent sign-ins use email/password. Password recovery also lets existing OTP users set a password without replacing their account. New passwords require at least eight characters; existing passwords are never rejected by new client-side registration rules at login.

This release adds shared APIs, preserves the old mobile OTP API and translations for compatibility, and delivers the Android password screens described in `16-MOBILE-PASSWORD-AUTH-AGENT.md`. No household rules or database identities change.

Notifications, automatic recurrence, threaded comments, attachments, subtasks, calendars, rewards and a cross-household admin panel are outside this MVP. Tasks have one shared editable notes field, not an authored discussion thread.

List/task removal is mentioned in BR 10 but not approved as a core UI flow. Test progress against the current non-deleted task set; defer user-facing removal until lifecycle behavior is approved. `status` can reserve archived state without exposing an archive command.
