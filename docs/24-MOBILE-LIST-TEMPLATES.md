# Android: list templates, list notes and template deletion

Android-side record of everything the list-template work changes, covering the
2026-09-22 requirements in `docs/23-LIST-TEMPLATES-AND-LIST-NOTES.md` and the
amended delete rule in `docs/18-LIST-TASK-LIFECYCLE.md`. It supersedes the
template and list-editing parts of `docs/22-MOBILE-WEB-PARITY.md`, which was
audited before any of this existed.

No Android-only API is involved. Every command comes from `@odin/data` and
every string from `@odin/i18n`, so the rules below are the shared rules; only
the presentation is Android's own.

## What the member can now do on Android

| Action                     | Where it lives                                      | Command               |
| -------------------------- | --------------------------------------------------- | --------------------- |
| Save a list as a template  | Overflow on the Home card, and on list detail       | `save_list_template`  |
| Delete a template          | Overflow on the Home card, and on list detail       | `delete_list`         |
| Read a list's shared note  | Under the subtitle on the Home card and list detail | `get_home`/`get_list` |
| Write a list's shared note | Note field under the subtitle field in the editor   | `update_list_v2`      |

## 1. Saving a list as a template

`Save as list template` sits in the same `ActionMenu` that already carries
`Delete list`, on the Home card for an active list and in the list-detail
action header. It is not destructive, so it takes no confirmation alert — the
new template card appearing on Home is the confirmation, backed by a polite
live-region line.

The command is `saveListTemplate(client, requestId, listId)`. It invalidates
Home only: the source list is not modified and keeps its version, so there is
nothing to refetch for the open list.

Saving a list writes **one list template**. It must never also write task
templates — a task template stays a separate, independently loadable thing, and
the task editor's picker must keep reading `get_task_templates` alone.

## 2. Deleting a template

`Delete list` now appears on template cards and template detail as well as
active ones. Same destructive `Alert.alert` confirmation as an active list,
same `expected_version` from the summary, same `CONFLICT` handling.

The summary DTO already carries `version`, so no extra read is needed before
deleting from Home.

## 3. The shared list note

- Rendered under the subtitle on `ListCard`, and by `ListMeta` on list detail,
  in muted text.
- Edited by a `multiline` field with `numberOfLines={4}` placed under the
  subtitle field in `ListEditor`, validated with the shared `validateNotes`
  before submit.
- An empty field submits `null`, never an empty string.
- `updateList` is called with `notes`, which routes to `update_list_v2`.
  Omitting `notes` entirely keeps the legacy `update_list`, which preserves an
  existing note — that path exists for installed builds, not for this one.

## 4. Wording

`home.templates.heading` is "List templates" and the task editor's actions say
"task template", so the two types are never just "templates". Both languages
carry the change; the i18n parity test fails the build if one is missing.

## Android presentation rules that still hold

- Secondary and destructive list actions stay in the overflow bottom menu
  rather than a row of buttons.
- Destructive actions keep the native confirmation alert.
- Touch targets stay at least 48 dp and every control keeps a TalkBack label.
- Template cards keep their border; active cards do not.
- A template's tasks stay read-only: no completion, edit, delete or unassign
  control is rendered on them.

## Verification status

Automated, on every push: Android Jest suites (including `ListCard` coverage
for the note, the save action and the absence of any task-template entry),
typecheck, lint, Expo Doctor and a production Android export.

Not verified, and required before any release claim: nothing in this work has
been exercised on an emulator or a physical device. The new overflow entries,
the multiline note field's keyboard behaviour, TalkBack traversal of the new
controls and dynamic font scaling all still need a device pass, as
`docs/22-MOBILE-WEB-PARITY.md` and `docs/14-MOBILE-IMPLEMENTATION.md` already
record for the wider app.
