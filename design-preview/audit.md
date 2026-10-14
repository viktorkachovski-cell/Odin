# Odin Android UI review

Historical review: the owner approved this direction on 2026-10-13 and requested
native implementation, tests and deployment. Follow-through evidence is in
[`../docs/android-ui-acceptance-2026-10-14.md`](../docs/android-ui-acceptance-2026-10-14.md)
and `design-qa.md`. Findings and pre-implementation limits below are retained as
the record of what was reviewed.

Reviewed 13 October 2026 against main at `ff31606f4686cd73ea7051f00d71fd60aded3d95`.

The current app has a coherent identity and a useful four-destination structure. The best next step is to improve scanning, ownership clarity and filter discovery while preserving its warm ivory, oak and green palette. The proposal is an interactive design review, with no production changes.

## What was reviewed

The goal is to find today's work, understand who has a task, claim or complete it, and add work to the right list. Current Today, Tasks, Lists and Templates are rendered from the actual Android screen/component code through React Native for Web, with fictional household data. Source layouts, shared translations, filtering and date rules are reused. Data/auth/command hooks, routing, safe-area measurements and theme selection are replaced by local preview adapters. Baseline mutation hooks are inert; use Proposed UI for interactive mutation demonstrations.

These are browser captures of Android components, not screenshots of an installed APK. Browser font metrics, clipping, native modal portals, touch feedback and input behavior can differ. Native task/list editors and Settings were inspected in source; their current native flows were not visually captured. Device notifications, email, backend concurrency and realtime were not tested by this audit.

## Captured steps and findings

1. **Today** — `01-current-today.jpg`. Four counts, grouped personal tasks, Claim and list progress are useful. The counts describe the household while My tasks describes the current member: in this fixture, Due today is 2 and the personal Today group is 1. Make that scope clear. The date is clipped in the browser rendering; treat it as a native check item, not a confirmed Android bug.
2. **Tasks** — `02-current-tasks.jpg`. Mine / Unassigned / Everyone, search and date grouping form a good task register. The deadline rail shows only the first choices; No deadline, Date range and Blocked only start offscreen. Rows compete for width between the completion target, title, notes preview, list/date, avatar and overflow. Assignees are visible only as initials; full names are available to assistive technology in source.
3. **Lists** — `03-current-lists.jpg`. Active/Templates separation, explicit Reorder, fractions and progress preserve useful structure. The plain row looks clickable, but it has no directional cue; subtitles and shared notes compete with its title. Use a clearer row hierarchy and keep secondary actions in menus.
4. **Templates** — `04-current-templates.jpg`. Use template is explicit, and template tasks are counted. Keep this distinction, independence and copy-reset behavior. Additional read-only previews or restore/archive management need separate decisions and are not implemented here.
5. **Proposed task entry** — `08-proposed-create.jpg`. Title and list are immediately visible; assignee, optional date/time and shared notes sit under one expandable section. The simulated keyboard leaves the create action reachable. Blank titles and time-only deadlines are rejected without dropping typed text. This is a proposed interaction, not a verified native editor improvement.

## Prioritized improvements

| Priority | Evidence                                             | Recommendation                                                                                                            | Tradeoff                                                                                                        |
| -------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| P2       | Tasks, step 2                                        | Give task titles more room; separate list, deadline and assignment; show names rather than initials alone in shared views | Fewer rows fit at once; keep Today compact and omit repeated ownership there                                    |
| P2       | Tasks, step 2                                        | Replace the offscreen filter rail with a Filters sheet, visible selected state, active-filter count and Clear filters     | A common deadline filter takes an extra tap; this is a product choice                                           |
| P2       | Today, step 1                                        | Make household counts and personal work visibly distinct; retain the existing counts and destinations                     | Small copy/hierarchy change; verify that people understand whose work is counted                                |
| P2       | Source navigation contract; proposed scrolling check | Consider keeping the four destinations visible while scrolling                                                            | Less content space; changes the confirmed hide-on-scroll behavior and needs explicit approval                   |
| P2       | Task editor source; proposed entry, step 5           | Start task creation with title/list and reveal optional fields together                                                   | Assignment and deadlines require an extra tap; native template actions must stay reachable                      |
| P3       | Lists, steps 3–4                                     | Refine list hierarchy, progress, row affordance and template identification                                               | Preserve creation, reordering, notes, template save/copy and destructive confirmations in native implementation |

The implementation pass must preserve one assignee, equal member permissions, task-only deadlines, shared order, copy-reset rules and household isolation. No rewards, child/guardian roles, list deadlines, recurrence or new backend features are proposed.

## What the HTML demonstrates

Today, Tasks, Lists, list detail and a limited Settings presentation; task search over title/notes/list, Mine/Unassigned/Everyone, deadline/blocked/done filters, task creation/editing, claim, completion/reopening, list creation, progress and completed-task disclosure. These operate on fictional data in memory. Reloading resets them. Offline disables writes; typed editor text remains in the open sheet. Templates show an explicit demo limitation rather than pretending a copy was made. Native reorder/menu, deletion, invitation, notification, profile and task-template actions remain production features and must be preserved during implementation; they are not all simulated in this HTML.

Use Current components / Proposed UI, English/Bulgarian, light/dark, empty/offline, long text, 150% text and 320/360/390/427px content-width controls. Width controls constrain app content inside the fixed Pixel device frame; they are not Android device emulation. The iPhone picker is retained as template infrastructure; it is not a proposed iOS launch.

## Accessibility evidence and limits

Source has labeled completion checkboxes, separate task-opening targets, visible Overdue/Blocked text and a 48dp theme target. The proposed HTML retains these distinctions, keyboard-visible focus and labeled fields. Its measured app controls on the tested narrow Today state were at least 48 CSS pixels high, with no horizontal overflow. The filter sheet exposes all choices together and uses a focus-managed dialog. Checkbox target size includes its clickable label; the visible square itself is smaller.

At 320px and 150% text, the proposal stacks tile numbers above labels and places row actions below text. Long titles scroll. Navigation labels truncate in the narrow stress case while accessible labels retain the full destination. The template's dark status icons and other device chrome are outside the app-design scope and do not prove native system-bar behavior. Full Android font scaling, TalkBack reading order, announcements after mutations, native keyboard/date-picker behavior, focus restoration and reduced-motion behavior still need a device pass. No full WCAG or Android accessibility compliance is claimed.

Reference targets: [Android accessibility principles](https://developer.android.com/guide/topics/ui/accessibility/principles) recommends 48dp touch targets; [WCAG 2.2 target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) uses a different web minimum and exceptions. CSS pixels measured here are not a native dp measurement. [React Native for Web](https://necolas.github.io/react-native-web/docs/) describes the browser compatibility layer used for the baseline.

## Verification

- Preview `npm run build`: TypeScript compilation, Vite production bundle and the protected mobile-runtime integrity check passed. The preview bundle emits a non-blocking size warning because it includes the existing UI and comparison runtime; it is not an Android bundle measurement.
- Preview `npm run test:sites`: 4 static-artifact/worker tests passed. No site was deployed.
- Odin `npm run test:mobile`: 18 Jest suites / 138 tests passed; the subsequent Node build-environment test runner was blocked by sandbox `spawn EPERM`.
- Retried in `apps/mobile`: `node --test scripts/validate-build-env.test.mjs` with process spawning enabled: 4 tests passed.
- Browser flow: deadline filter apply/clear, completion and count updates, claiming into Mine, empty-title validation, new-task creation/editing, time-only rejection, date-only save, shared-language switch and simulated keyboard positioning exercised. Date/time automation fill did not commit values; keyboard editing of their native segments was used to verify the deadline behavior.
- Browser visual QA: matched Today and Tasks comparisons; 320/360/390/427px content widths, large Bulgarian text, light/dark and empty/offline states inspected. The saved `design-qa.md` records the final scope and limitations.

## Approval and release scope

Approve the visual direction separately from these three behavior choices: **persistent navigation**, **Filters sheet instead of the rail**, and **collapsed optional editor fields**. All are demonstrated, none is shipped. Any native implementation must restore/preserve the complete production action set, use the shared contracts and translations, update behavior documentation, and pass the repository checks plus an Android build. Publishing a website cannot update installed Android apps: approved native changes require the project's signed Android release/distribution process. Device acceptance remains a release gap.

No source behavior, shared API, hosted database, production environment, dependency lockfile or release state was changed by this review. Existing known risks were not closed or reclassified. Preview artifacts are left uncommitted.
