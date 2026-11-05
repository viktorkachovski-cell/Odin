import { useState, type ReactNode } from 'react';

import type { CommandError, MemberDto, TaskDto } from '@odin/contracts';
import {
  dueIssueKey,
  mergeAssigneeEdit,
  resolveDueInput,
  taskAssigneeIds,
  taskDraft,
  validateNotes,
  validateTaskTitle,
  type TaskDraft,
} from '@odin/domain';
import { issueText, type Translator } from '@odin/i18n';

import { AssigneePicker } from './AssigneePicker.tsx';
import { ErrorBanner } from './Banner.tsx';
import { Dialog } from './Dialog.tsx';
import { Field } from './Field.tsx';
import { TaskTemplates } from './TaskTemplates.tsx';

/**
 * Task editor. Drafts survive a failed save: on CONFLICT the typed text is kept
 * and the member is offered a review of the latest version. A template task is
 * edited text-only: it never carries an assignee or a deadline, which the
 * server refuses as well.
 */

interface TaskEditorProps {
  readonly task: TaskDto | null;
  readonly members: readonly MemberDto[];
  /** The signed-in member, for Assign to me and Remove me. */
  readonly currentUserId: string | null;
  readonly t: Translator;
  readonly pending: boolean;
  /** A CONFLICT keeps the draft and offers `onReviewConflict` instead of a banner. */
  readonly error: CommandError | null;
  readonly onCancel: () => void;
  readonly onReviewConflict: () => void;
  /** Rendered above the title, for the global New task editor's list picker. */
  readonly listField?: ReactNode;
  /** Offered as a quiet destructive action on the left of the footer. */
  readonly onDelete?: (() => void) | undefined;
  /** Title and notes only, for a template task. */
  readonly textOnly?: boolean;
  readonly onSubmit: (input: {
    readonly title: string;
    readonly notes: string;
    /** The complete assignment set the member chose; empty means unassigned. */
    readonly assigneeIds: readonly string[];
    readonly dueAt: string | null;
  }) => void;
}

export function TaskEditor({
  task,
  members,
  currentUserId,
  t,
  pending,
  error,
  onCancel,
  onReviewConflict,
  onSubmit,
  listField,
  onDelete,
  textOnly = false,
}: TaskEditorProps): ReactNode {
  const [draft, setDraft] = useState<TaskDraft>(() => taskDraft(task));
  // The assignment the editor opened with, and the version it came from. When
  // the task is replaced by a newer one (after a conflict review), the member's
  // own assignee changes are carried onto it instead of overwriting it.
  const [origin, setOrigin] = useState<{
    readonly version: number;
    readonly ids: readonly string[];
  }>(() => ({ version: task?.version ?? 0, ids: draft.assigneeIds }));
  if (task !== null && task.version !== origin.version) {
    const latest = taskAssigneeIds(task);
    setOrigin({ version: task.version, ids: [...latest].sort() });
    setDraft((current) => ({
      ...current,
      assigneeIds: mergeAssigneeEdit(origin.ids, current.assigneeIds, latest),
    }));
  }
  const [titleIssue, setTitleIssue] = useState<string | undefined>(undefined);
  const [notesIssue, setNotesIssue] = useState<string | undefined>(undefined);
  const [dueIssue, setDueIssue] = useState<string | undefined>(undefined);
  const conflict = error?.code === 'CONFLICT';

  const submit = (): void => {
    const titleCheck = validateTaskTitle(draft.title);
    const notesCheck = validateNotes(draft.notes);
    const due = resolveDueInput(draft);
    setTitleIssue(issueText(titleCheck, t));
    setNotesIssue(issueText(notesCheck, t));
    setDueIssue(due.ok ? undefined : t(dueIssueKey(due.reason)));
    if (titleCheck !== null || notesCheck !== null || !due.ok) return;
    onSubmit({
      title: draft.title.trim(),
      notes: draft.notes.trim(),
      assigneeIds: textOnly ? [] : draft.assigneeIds,
      dueAt: textOnly ? null : due.dueAt,
    });
  };

  // A new task can start from a template, so the chooser leads; an existing
  // task's "save as template" is secondary and sits below the fields.
  const templates = (
    <TaskTemplates
      draft={draft}
      allowChoose={task === null}
      disabled={pending}
      onChoose={(template) =>
        setDraft({
          title: template.title,
          notes: template.notes ?? '',
          assigneeIds: [],
          dueDate: '',
          dueTime: '',
        })
      }
      t={t}
    />
  );

  return (
    <Dialog
      footer={
        <>
          {onDelete !== undefined && (
            <button
              className="button button--quiet button--danger dialog__start"
              disabled={pending}
              onClick={onDelete}
              type="button"
            >
              {t('task.delete.short')}
            </button>
          )}
          <button className="button" onClick={onCancel} type="button">
            {t('task.cancel')}
          </button>
          <button
            className="button button--primary"
            disabled={pending}
            onClick={submit}
            type="button"
          >
            {pending ? t('state.saving') : t('task.save')}
          </button>
        </>
      }
      onClose={onCancel}
      title={task === null ? t('task.new.title') : t('task.edit.title')}
      variant="side"
    >
      {listField}
      {conflict && (
        <div className="banner banner--danger" role="alert">
          <div>
            <strong>{t('conflict.title')}</strong>
            <p>{t('conflict.body')}</p>
          </div>
          <button className="button" onClick={onReviewConflict} type="button">
            {t('conflict.review')}
          </button>
        </div>
      )}

      {error !== null && !conflict && <ErrorBanner error={error} t={t} />}

      {task === null && templates}
      <Field error={titleIssue} label={t('task.title.label')}>
        {(props) => (
          <input
            {...props}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            type="text"
            value={draft.title}
          />
        )}
      </Field>

      <Field error={notesIssue} label={t('task.notes.label')}>
        {(props) => (
          <textarea
            {...props}
            rows={4}
            value={draft.notes}
            onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
          />
        )}
      </Field>
      {!textOnly && (
        <>
          <AssigneePicker
            currentUserId={currentUserId}
            members={members}
            onChange={(assigneeIds) => setDraft((current) => ({ ...current, assigneeIds }))}
            selected={draft.assigneeIds}
            t={t}
          />

          <div className="field__row">
            <Field error={dueIssue} label={t('task.due.date')}>
              {(props) => (
                <input
                  {...props}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, dueDate: event.target.value }))
                  }
                  type="date"
                  value={draft.dueDate}
                />
              )}
            </Field>
            <Field label={t('task.due.time')}>
              {(props) => (
                <input
                  {...props}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, dueTime: event.target.value }))
                  }
                  type="time"
                  value={draft.dueTime}
                />
              )}
            </Field>
          </div>
        </>
      )}

      <button
        className="button button--quiet"
        onClick={() => setDraft((current) => ({ ...current, dueDate: '', dueTime: '' }))}
        type="button"
      >
        {t('task.due.clear')}
      </button>
      {task !== null && templates}
    </Dialog>
  );
}
