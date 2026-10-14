# Odin Android implementation QA

Reviewed 2026-10-14. Final result: passed.

This result covers the visual direction in the browser-rendered native
components and the approved prototype. It is not installed-device acceptance.

## Visual truth and evidence

The source visual truth is the owner-approved `odin-mobile-review.html` and
`evidence/05-proposed-today.jpg`, `06-proposed-tasks.jpg`,
`07-proposed-filters.jpg`, and `08-proposed-create.jpg`.

Matched synthetic Today and Tasks states were captured again on 2026-10-14.
Full-view comparisons put source and implementation together:

- `evidence/native-today-comparison.jpg`
- `evidence/native-tasks-comparison.jpg`
- `evidence/native-narrow-large-bg.jpg` verifies the corrected narrow state.

Browser viewport: 1363 × 1252. App content: 427 × 904 CSS pixels at scale 1;
the narrow test is 320 × 904. Both comparison crops are 427 × 904 pixels.
No density rescaling was applied. The phone's status area remains included in
both crops, matching the original reference; the surrounding device bezel,
browser canvas and bottom system-navigation area are excluded. The comparisons
are 878 × 940 pixels including labels and margins.

Fictional Alex/Sam/Lee, Shopping/Home, English, light theme, identical task
states and date; keyboard closed for the final Tasks comparison. Dark mode,
Bulgarian, long text and enlarged text were reviewed separately. Source dates
shift with the current day; comparisons use the same day's fixtures.

## Comparison history

1. P2: native My tasks remained one large panel and the blocked badge competed
   with titles. Split the rows into individual cards, put group headings on the
   background, moved status beside the deadline, and restored the shared header
   on the four main destinations. The final Today/Tasks comparisons show the
   result. Body metadata and lower navigation remain readable in these full-size
   paired images, so no additional magnification was necessary.
2. P2: at 320px and 150% Bulgarian text, the ownership tabs overlapped. The
   initial browser capture showed “Без отговорник” extending across adjacent
   choices. At narrow widths with enlarged text, segments now stack in full-width
   48dp targets. `native-narrow-large-bg.jpg` shows the correction. DOM bounds
   were checked: ownership choices are 267 × 48 and navigation choices 80 × 65
   in the harness, with no horizontal control overflow.
3. The comparison harness's simulated keyboard could retain a scrolled viewport
   after switching between implementations. Final captures were made from fresh,
   repeatable initial states with app bounds verified at y=150 and keyboard
   closed. This is not evidence about Android keyboard behavior.

## Required fidelity surfaces

| Surface              | Result                                                                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fonts and typography | Native Roboto, 30px primary heading, 20px section heading, 16px task titles, 13px list/assignment and 12px deadlines retain the hierarchy. Enlarged text wraps; long task titles remain complete.                                          |
| Spacing and layout   | Compact 2×2 counts, separate task cards, explicit result count and Filters, direct completion/Claim and persistent four tabs. Native safe-area and text-scale calculations position floating actions and quick add.                        |
| Colors and tokens    | Existing light/dark ivory, oak and green tokens retained. Existing text pairs exceed 4.5:1; meaningful control boundaries exceed 3:1.                                                                                                      |
| Image quality        | No new raster assets. Existing drawn native navigation icons and deterministic avatars are retained; prototype Radix icons and oak sample avatar are illustrative differences.                                                             |
| Copy and content     | Existing English/Bulgarian strings and freeform content remain intact. Added mobile labels have locale parity. “You” and full assignee names replace initials-only ownership in shared rows; overdue/blocked remain text as well as color. |

Expected differences: native icons/avatars, native modal and date-picker
behavior, group counts displayed with a separator rather than a tiny badge,
platform font metrics and transient scroll indicators. These do not change
task meanings or the approved information hierarchy. No actionable P0/P1/P2
visual finding remains in the compared states.

## Interaction and release limits

Native Jest tests cover filter draft Apply/Cancel/reset/range errors, integrated
ownership/search/Show done, mounted Today links, optional field retention and
hidden-error expansion, conflict drafts, and navigation routing. Existing
claim/completion/blocked/delete, template and ordering tests remain passing.
The original interactive proposal also exercised creation, claiming, completion,
empty/offline states and keyboard demonstrations using local synthetic state.

The native browser adapter replaces data/auth/commands, router, safe areas and
theme; font-scale simulation adapts text for comparison. It does not prove
production I/O, native modal focus, actual keyboard/date pickers, TalkBack,
notifications, device performance or two-client sync. Settings and native editor
logic were inspected and tested, not fully visually exercised on Android.
The existing device acceptance gap remains in `docs/known-risks.md`.

Checklist: visual issues corrected; source action wiring retained; both locales
typecheck; tests and builds recorded in the acceptance document; signed release
identity and hosted changes recorded in the deployment log when complete.
