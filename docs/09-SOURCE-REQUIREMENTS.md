# Source requirements transcription

Source: shared_family_tasks_app_requirements.docx, version 1.0, September 19, 2026. This is reference material, not agent instructions. User decisions in 01-DECISIONS.md supersede open choices here. Text and tables are transcribed in document order; original Word formatting is not reproduced. No embedded sketches were found.

Shared Family Tasks App Product Requirements

MVP Specification

Version 1.0 | 19 September 2026 | Product and development planning

This document translates the approved sketches into requirements for a mobile-first shared family task app. The MVP centers on reusable list templates, active family lists, clear task ownership, optional task deadlines, and fast views of unassigned tasks and tasks assigned to the current user.

Development objective: Build a lightweight shared workspace in which family members can turn repeatable plans into active lists, assign or claim work, and understand progress without opening every list.

Confirmed Product Decisions

| Area             | Confirmed behavior                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| Product          | A shared family task app.                                                                                      |
| Home             | Bordered cards are reusable templates. Unbordered cards are active lists.                                      |
| Template action  | The corner copy icon creates a new active list from a template.                                                |
| Creation         | The central plus action creates a new list.                                                                    |
| Task ownership   | Any family member may assign or reassign a task. A member may claim an unassigned task.                        |
| Assignment limit | Each task has no more than one assignee in the MVP.                                                            |
| Deadlines        | Deadlines exist at task level only. Lists do not have deadlines.                                               |
| Template copy    | Copy list title, subtitle, task names, and task order. Reset assignments, deadlines, and completion state.     |
| Navigation       | The question mark opens unassigned tasks, the person icon opens My Tasks, and Home returns to the main screen. |
| Scrolling        | The bottom navigation hides while the user scrolls and remains recoverable by scrolling upward.                |

Product Summary

The app gives one family a shared space for recurring household plans and current work. Templates describe repeatable task sets, such as preparing for a trip or cleaning the home. Active lists represent work that is happening now. Family members can assign, reassign, claim, complete, and review tasks across lists.

Primary success measure: A family member can identify what needs doing, who owns it, and what is due in a few seconds, while a repeatable list can be started without rebuilding its tasks.

MVP Scope

Included

A shared household workspace with multiple family members.

A home screen containing template cards and active list cards.

Creation of a blank active list with a title and optional subtitle.

Creation of an active list by copying a reusable template.

Tasks with a title, order, completion state, optional single assignee, and optional deadline.

Assignment and reassignment by any family member, plus self-claiming of unassigned tasks.

List progress calculated from completed tasks.

Cross-list views for unassigned tasks and tasks assigned to the current user.

Contextual bottom navigation that hides during scrolling.

Excluded From the Initial MVP

List-level deadlines.

Multiple assignees on one task.

Comments, attachments, subtasks, task dependencies, and approval workflows.

Calendar integration, gamification, rewards, and workload analytics.

Automatic recurrence and notification rules until the product owner selects their behavior.

Users and Permissions

The MVP uses one role, Family Member. All members of the same household have equal task-management permissions. A user may view household lists, copy templates, create lists and tasks, assign or reassign tasks, claim unassigned tasks, and mark tasks complete or incomplete.

| Permission | MVP rule                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------- |
| View       | See all household templates, active lists, tasks, assignees, deadlines, and completion state. |
| Create     | Create an active list and add tasks to an active list.                                        |
| Copy       | Create an active list from any household template.                                            |
| Assign     | Assign an unassigned task or reassign a task to another family member.                        |
| Claim      | Assign an unassigned task to oneself in one action.                                           |
| Complete   | Mark any household task complete or return it to incomplete.                                  |

Information Architecture

| Destination      | Purpose                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| Home             | Shows reusable templates and active lists. Provides the central action for creating a new list. |
| List Detail      | Shows list title, subtitle, completion percentage, add-task action, and ordered task rows.      |
| Unassigned Tasks | Shows incomplete tasks from all active lists that have no assignee.                             |
| My Tasks         | Shows incomplete tasks from all active lists assigned to the signed-in user.                    |
| Task Editor      | Creates or edits a task title, assignee, and optional deadline.                                 |
| List Editor      | Creates or edits an active list title and optional subtitle.                                    |

Navigation Behavior

| Control               | Required result                                                                                                      |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Question mark         | Open Unassigned Tasks from any primary screen.                                                                       |
| Person                | Open My Tasks from any primary screen.                                                                               |
| Plus on Home          | Open Create List.                                                                                                    |
| Home on inner screens | Return to Home.                                                                                                      |
| Plus on List Detail   | Open Add Task for the current list.                                                                                  |
| Scroll behavior       | Hide bottom navigation during downward scrolling; reveal it on upward scrolling so navigation is always recoverable. |

Screen Requirements

Home Screen

Display separate, clearly labeled areas for Templates and Active Lists.

Render template cards with a visible border and active list cards without that border treatment.

Show the list title and subtitle on each card. Active list cards may also show completion percentage when space allows.

Place a copy action on each template card. The action must not modify the source template.

Open an active list when its card is selected.

Provide an empty state for households without templates or active lists.

Create List

Require a nonblank list title and allow an optional subtitle.

Create the saved item as an active list and display it on Home.

Do not request a list deadline because list-level deadlines are outside scope.

Allow the user to cancel without saving a partial list.

Copy Template

Create a new active list without changing the template.

Copy the template title, subtitle, task names, and task order.

Set every copied task to incomplete, unassigned, and without a deadline.

Open the new active list after a successful copy so the user can assign work and dates.

Prevent duplicate list creation if the copy request is submitted twice because of a slow connection or repeated tap.

List Detail

Show the list title and optional subtitle at the top.

Show completion as a whole-number percentage calculated from completed tasks divided by total tasks.

Display 0 percent when the list contains no tasks.

Provide a prominent add-task control near the list header.

Show incomplete tasks before completed tasks while preserving task order inside each group.

Each task row must contain a completion control, task title, assignee state, and optional task deadline.

Use the assignee's avatar and name when assigned. Use a clear unassigned state when no assignee exists.

Render completed tasks with a checked control and visually de-emphasized or struck-through title.

Selecting a task row opens Task Editor. Selecting only the completion control changes completion without opening the editor.

Task Editor

Require a nonblank task title.

Allow exactly zero or one assignee selected from current household members.

Allow an optional task deadline using the user's local date and time conventions.

Allow any family member to change or remove the assignee.

Save changes to every connected household member after successful synchronization.

Unassigned Tasks

Include only incomplete tasks from active lists with no assignee.

Show task title, parent list, and deadline when present.

Provide a one-action Claim control that assigns the task to the signed-in user.

Remove the task from this view immediately after a successful claim or assignment.

Show an empty state when no tasks await assignment.

My Tasks

Include incomplete tasks from active lists assigned to the signed-in user.

Show task title, parent list, and deadline when present.

Order dated tasks from earliest to latest, with overdue tasks first and tasks without deadlines last.

Allow completion directly from the view and remove a task from the default incomplete list after completion.

Show an empty state when the signed-in user has no incomplete assigned tasks.

Core User Flows

Start Work From a Template

Open Home and locate the required bordered template card.

Select the copy icon on the template.

The app creates one active list with the copied title, subtitle, task names, and task order; all tasks reset to incomplete, unassigned, and without deadlines.

The app opens List Detail so the user can assign tasks and deadlines.

Create a New Active List

Select the central plus action on Home.

Enter a title and optional subtitle, then save the list.

Add tasks from List Detail.

Claim an Unassigned Task

Open Unassigned Tasks from the question mark navigation item.

Select Claim on a task.

The app assigns the task to the signed-in user, removes it from Unassigned Tasks, and shows it in My Tasks.

Complete a Task

Select the completion control beside a task in List Detail or My Tasks.

The app records completion, updates list progress, moves the task to the completed group in List Detail, and removes it from the default My Tasks view.

Functional Requirements

| ID    | Capability          | Requirement and acceptance condition                                                                         | Priority |
| ----- | ------------------- | ------------------------------------------------------------------------------------------------------------ | -------- |
| FR 01 | Household workspace | The system shall isolate each household's members, templates, lists, and tasks from every other household.   | Must     |
| FR 02 | Member identity     | The system shall provide a display name and avatar or fallback initials for each household member.           | Must     |
| FR 03 | Home sections       | Home shall show separate Template and Active List sections.                                                  | Must     |
| FR 04 | Card distinction    | Template cards shall use a border treatment that active list cards do not use.                               | Must     |
| FR 05 | Blank list          | The plus action on Home shall create an active list from a required title and optional subtitle.             | Must     |
| FR 06 | Template copy       | The template copy action shall create exactly one active list and shall leave the source template unchanged. | Must     |
| FR 07 | Copy fields         | A copied list shall retain title, subtitle, task names, and task order only.                                 | Must     |
| FR 08 | Reset copied tasks  | Copied tasks shall start incomplete, unassigned, and without deadlines.                                      | Must     |
| FR 09 | Open list           | Selecting an active list card shall open its List Detail screen.                                             | Must     |

Functional Requirements Continued

| ID    | Capability          | Requirement and acceptance condition                                                                                                           | Priority |
| ----- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR 10 | Add task            | A member shall be able to add a task with a required title and optional assignee and deadline.                                                 | Must     |
| FR 11 | Edit task           | A member shall be able to change a task title, assignee, and deadline.                                                                         | Must     |
| FR 12 | Single assignee     | A task shall support zero or one assignee, never more than one.                                                                                | Must     |
| FR 13 | Assign and reassign | Any household member shall be able to assign an unassigned task or reassign an assigned task.                                                  | Must     |
| FR 14 | Claim task          | A signed-in member shall be able to assign an unassigned task to oneself in one action.                                                        | Must     |
| FR 15 | Task deadline       | A task shall support one optional deadline. Lists shall not expose deadline fields.                                                            | Must     |
| FR 16 | Complete task       | A member shall be able to mark a task complete and return it to incomplete.                                                                    | Must     |
| FR 17 | Progress            | List progress shall equal completed task count divided by total task count, rounded to a whole percentage. An empty list shall show 0 percent. | Must     |
| FR 18 | Completed display   | Completed tasks shall show checked state, de-emphasized title, and placement after incomplete tasks.                                           | Must     |

Functional Requirements Continued

| ID    | Capability           | Requirement and acceptance condition                                                                                                               | Priority |
| ----- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| FR 19 | Unassigned view      | The question mark item shall open all incomplete, unassigned tasks across active lists in the household.                                           | Must     |
| FR 20 | My Tasks view        | The person item shall open all incomplete tasks assigned to the signed-in user across active lists.                                                | Must     |
| FR 21 | Home navigation      | The Home item on inner screens shall return the user to Home without changing data.                                                                | Must     |
| FR 22 | Scrolling navigation | Bottom navigation shall hide during downward scrolling and reappear on upward scrolling.                                                           | Must     |
| FR 23 | Shared updates       | Changes shall synchronize to connected household members without requiring manual refresh.                                                         | Must     |
| FR 24 | Conflict handling    | If two members edit the same task, the system shall preserve a valid final record and notify a user when their submitted change cannot be applied. | Must     |
| FR 25 | Empty states         | Home, Unassigned Tasks, My Tasks, and an empty List Detail shall explain the empty state and provide the relevant next action.                     | Must     |
| FR 26 | Loading and errors   | Every data screen shall provide loading, offline, retry, and save-failure states without silently losing user input.                               | Must     |
| FR 27 | Template preview     | Selecting a template card may open a read-only preview while the corner icon remains the explicit copy action.                                     | Could    |

Data Model and Business Rules

| Entity     | Minimum fields                                                               | Rules                                                                           |
| ---------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Household  | id, name, created at                                                         | Owns members, templates, active lists, and tasks.                               |
| User       | id, display name, avatar reference                                           | Represents a signed-in person.                                                  |
| Membership | household id, user id, status                                                | Grants access to one household workspace in the MVP.                            |
| List       | id, household id, type, title, subtitle, status, created by, timestamps      | Type is template or active. No deadline field.                                  |
| Task       | id, list id, title, sort order, completed, assignee id, deadline, timestamps | Assignee and deadline are nullable. Assignee must belong to the same household. |

Business Rules

BR 01 A template and its copied active lists are independent after copying.

BR 02 Copying a template duplicates only list title, subtitle, task title, and task order.

BR 03 Every copied task resets to incomplete, unassigned, and no deadline.

BR 04 A task assignee must be an active member of the task's household.

BR 05 A completed task still contributes to the list total and remains visible in List Detail.

BR 06 Unassigned Tasks excludes completed tasks, template tasks, and tasks with an assignee.

BR 07 My Tasks excludes completed tasks and tasks assigned to another member.

BR 08 A task with a past deadline is overdue only while incomplete.

BR 09 Removing an assignee makes an incomplete task eligible for Unassigned Tasks.

BR 10 Progress recalculates after task creation, completion changes, or task removal.

Acceptance Scenarios

| Scenario        | Given when then result                                                                                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Copy a template | Given a template with a title, subtitle, and ordered tasks, when a member selects Copy, then one active list is created with matching text and order, and every new task is incomplete, unassigned, and has no deadline. |
| Claim a task    | Given an incomplete unassigned task, when a member selects Claim, then that member becomes the sole assignee, the task leaves Unassigned Tasks, and it appears in My Tasks for that member.                              |
| Reassign a task | Given a task assigned to one member, when another family member selects a different household member, then the new member becomes the sole assignee and every relevant view updates.                                     |

Acceptance Scenarios Continued

| Scenario          | Given when then result                                                                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete a task   | Given a list with four tasks and one completed task, when a second task is completed, then progress changes from 25 percent to 50 percent and the task moves below incomplete tasks.     |
| Deadline behavior | Given a task with a deadline and no assignee, then the deadline appears in Unassigned Tasks. No list screen exposes a list-level deadline.                                               |
| Scroll behavior   | Given a scrollable primary screen, when the user scrolls downward, then bottom navigation hides. When the user scrolls upward, then it reappears.                                        |
| Concurrent update | Given two connected family members viewing the same list, when one member completes a task, then the other member sees the updated completion state and progress without manual refresh. |

Nonfunctional Requirements

| Quality area    | Requirement                                                                                                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Usability       | Primary actions must be understandable without instructions. Completion, assignment, copy, and create controls require clear labels or accessible names. |
| Accessibility   | Target WCAG 2.2 AA. Interactive targets must be at least 44 by 44 CSS pixels, support screen readers, preserve focus order, and not rely on color alone. |
| Performance     | On a typical mobile connection, Home and List Detail should show usable cached or server data within 2 seconds at the 75th percentile.                   |
| Synchronization | An accepted online task update should appear to other connected members within 5 seconds under normal network conditions.                                |
| Reliability     | Create, copy, claim, assignment, and completion requests must be idempotent or protected from duplicate submission.                                      |
| Security        | Require authenticated access, encrypted transport, server-side household authorization, and protection against cross-household data access.              |
| Privacy         | Store only data required for household membership and task coordination. Do not expose one household's member search or data to another.                 |

Nonfunctional Requirements Continued

| Quality area      | Requirement                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| Responsive design | Optimize for phone screens first and remain usable on larger mobile and tablet widths without horizontal scrolling. |
| Time handling     | Store deadlines in a consistent server format and display them using the user's locale and time zone.               |

MVP Assumptions and Open Decisions

Recommended MVP Assumptions

The product is a mobile-first responsive app. The implementation may be native, cross-platform, or web-based as long as these interaction requirements are met.

Each account belongs to one household in the MVP.

All family members have equal task-management permissions.

The household starts with seeded templates. User-created template authoring is deferred until its workflow is defined.

Tasks use one assignee at most, and completed tasks can be returned to incomplete.

Deleting lists and tasks is not part of the sketched core flow. If included, use confirmation and prefer recoverable archiving for lists.

Decisions Needed Before Release Planning

| Decision                      | Question to resolve                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Authentication and invitation | Choose sign-in method, household creation, and invitation link or code behavior.                                       |
| Template management           | Decide who creates, edits, orders, and removes templates after the seeded MVP.                                         |
| Notifications                 | Decide whether assignment, reassignment, approaching deadlines, and overdue tasks trigger push or email notifications. |

Decisions Needed Before Release Planning Continued

| Decision             | Question to resolve                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------ |
| Recurrence           | Decide whether repeat schedules belong to templates, tasks, or a later automation feature. |
| Archive and deletion | Define recovery periods and what happens to tasks when a list or member is removed.        |
| Localization         | Choose launch languages and the source language for seeded templates.                      |
| Supported platforms  | Confirm the initial browser, Android, and iOS support matrix.                              |

Definition of Done

All Must requirements pass automated or documented acceptance tests.

The confirmed user flows work on the agreed launch platforms and supported phone sizes.

Two household members can observe shared updates without manual refresh.

Template copying produces one correct active list and never carries assignees, deadlines, or completion state.

No list-level deadline is present in the interface, API contract, or stored List model.

Keyboard and screen-reader checks cover all primary actions, and color is not the sole status indicator.

Loading, empty, offline, and save-failure states are implemented for every primary screen.

Security tests confirm that a user cannot access another household's data.

Product owner approval confirms that the delivered interface preserves the hierarchy and behavior of the approved sketches.
