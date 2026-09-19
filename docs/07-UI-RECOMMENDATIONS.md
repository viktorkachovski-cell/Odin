# UI recommendations

These suggestions preserve the confirmed task model. The DOCX contains text/tables but no embedded sketches, so this is a requirements-based review, not a visual comparison with the original drawings.

## Include in the first design

| Improvement                 | Why and implementation                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Label navigation icons      | Keep the required question mark/person, add Unassigned/My Tasks text and accessible names; a question mark alone usually implies Help |
| Show both progress measures | “3 of 8 tasks · 38%” conveys remaining work; empty lists show “No tasks yet · 0%”                                                     |
| Make copy intent explicit   | Tooltip/accessibility label “Create list from template”; pending state prevents repeated taps; open the resulting list on success     |
| Use names with avatars      | Show fallback initials plus member name; never force users to recognize a color or photo                                              |
| Clear due status            | “Overdue · 18 Sep, 18:00” plus icon/color; completed items suppress overdue status                                                    |
| Keep Claim visible          | One explicit button in Unassigned; show pending then remove after success; conflict explains when someone else claimed it             |
| Gentle empty states         | Home: Create a list / Start a template; empty list: Add task; Unassigned/My Tasks: explain no pending work, offer Home                |
| Preserve drafts             | Inline field errors and retry; conflict panel keeps draft beside latest value; never discard a title after network failure            |
| Plan Bulgarian width        | Test real translations early; no flags as language selector; use English / Български text                                             |
| Accessible tap regions      | Large completion control separate from editor target; keyboard focus and labels; avoid accidental edits when checking a task          |

## Suggestions requiring product review

- Persistent desktop sidebar is better for mouse/keyboard work than hiding desktop navigation on scroll. Keep the source behavior on narrow/mobile screens unless an exception is approved.
- Hide-on-scroll can make navigation harder to find. Consider always-visible navigation as a later tested revision; do not silently replace the confirmed behavior now. At minimum review focus/reduced-motion accommodations.
- A read-only template preview reduces uncertainty before copying (FR 27, optional). Complete Must scope first.
- Collapsing completed tasks can shorten long lists but must keep them discoverable and included in totals. Default to the source's visible completed group until approved.
- Do not add rewards, streaks or “fairness” rankings to a family coordination tool without a separate discussion; these alter product behavior and are excluded from MVP.

## Layout directions for the agent

Mobile Home: header with household name and settings, Templates section, Active Lists section, accessible contextual bottom actions. Detail: back/home control, title/subtitle/progress, prominent Add task, incomplete group then completed group. Editors use an uncluttered sheet with explicit Save/Cancel, member selection and optional due date/time.

Desktop: proposed sidebar with Home, Unassigned and My Tasks; content grid on Home; wide task rows and optional side editor on detail; all data and commands remain identical to Android. Keep household identity visible to prevent confusion when session state changes.

## Design acceptance

Review at narrow phone width, large Android font setting, tablet width and desktop. Verify all controls in English and Bulgarian; long titles and initials; empty, busy, offline, conflict and success states; keyboard and TalkBack/screen-reader behavior. Product owner must approve fidelity to the original sketches, which were not attached here.
