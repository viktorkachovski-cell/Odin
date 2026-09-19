# Product decisions and boundaries

## Confirmed by the user in this task

| Topic               | Decision                                                                         |
| ------------------- | -------------------------------------------------------------------------------- |
| Launch              | Android and desktop web                                                          |
| Languages           | English and Bulgarian                                                            |
| Sign-in             | Email one-time code                                                              |
| Invitations         | Any household member may invite through an expiring link                         |
| Backend and hosting | Supabase Postgres; Vercel desktop website                                        |
| Deliverable now     | Markdown execution briefs, linter and handling rules, uploaded to Odin on GitHub |

## Confirmed by the source requirements

One active household per account in MVP; equal task permissions for every member; at most one task assignee; deadlines only on tasks. Any member may create, assign, reassign, claim, complete or reopen tasks. Template copying copies text/order only and resets ownership, deadlines and completion. Templates and active lists remain independent.

Home keeps bordered template cards and unbordered active cards in separately labeled sections. The question-mark control opens Unassigned, the person control opens My Tasks, and scrolling hides/reveals the bottom navigation. My Tasks and Unassigned exclude completed/template tasks. Empty-list progress is 0 percent.

## Proposed implementation defaults

These fill technical gaps without redefining confirmed task rules. Record deviations before implementation; do not silently treat proposed lifecycle policy as approved product scope.

| Topic                 | Proposed default and consequence                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| New household         | A signed-in account with no active household may create one or redeem an invitation; no public household directory           |
| Invitation lifetime   | 72 hours, one redemption, opaque high-entropy token stored only as a hash; expired/revoked/used links cannot join            |
| Invitation recipient  | Bearer link usable by a signed-in person; not email-bound; show household name only after secure token validation            |
| Invitation revocation | Creator may revoke their outstanding invitations; broader moderation remains undecided                                       |
| Email delivery        | Custom SMTP needed for a release-ready OTP flow; verify provider limits, delivery and OTP template before launch             |
| Task time             | Optional explicit local date and time converted to UTC instant; no implicit end-of-day or date-only deadlines                |
| Text limits           | Trimmed title 1–160 characters, subtitle up to 300, display name 1–80; enforce consistently using Unicode code points        |
| List task ordering    | Append at end, stable ordering; no drag-and-drop editing in MVP                                                              |
| Avatars               | Initials and deterministic accessible colors satisfy fallback requirement; uploads deferred                                  |
| Templates             | Versioned, reviewed English/Bulgarian seed content copied into each household; immutable in normal client UI                 |
| Seed selection        | Household chooses seed language during creation; UI language changes never translate existing user content                   |
| Offline               | Visible stale data and retained in-session drafts; no automatic offline write queue                                          |
| Sorting               | My Tasks: due timestamp ascending, nulls last, then stable list/task ID tie-breaker; Unassigned uses same deterministic sort |

## Decisions still required before release

1. Approve invitation lifetime, bearer-link behavior and onboarding defaults above; expiry value can be configuration, not hardcoded in clients.
2. Select Odin Supabase organization/region/plan and staging/production budget; select SMTP sender and provider. No reuse of LARP resources.
3. Decide member removal/household exit, account deletion and recovery policy. Equal task permissions do not imply authority to expel people. Until approved, do not expose removal UI. Backend design must still handle revoked membership safely.
4. Approve template seed titles/content in both languages. User template creation/editing remains deferred.
5. Choose Android distribution (private APK initially or Play Store), package identifier, signing ownership and exact supported Android/browser versions after Expo selection.
6. Decide whether children need accounts without email. The selected email OTP model assumes each member can receive email; agents must not invent shared logins or child/guardian roles.

Notifications, automatic recurrence, destructive deletion, archive/recovery workflows, iOS release, comments, attachments, subtasks, calendars, rewards and a cross-household admin panel are outside this MVP. Add none as hidden convenience features.

List/task removal is mentioned in BR 10 but not approved as a core UI flow. Test progress against the current non-deleted task set; defer user-facing removal until lifecycle behavior is approved. `status` can reserve archived state without exposing an archive command.
