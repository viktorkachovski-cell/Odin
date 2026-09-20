import { useState, type ReactNode } from 'react';

import type { CommandError, MemberDto, TaskDto } from '@odin/contracts';
import { dueDraftFromIso, resolveDueInput, validateTitle } from '@odin/domain';
import type { Translator, TranslationKey } from '@odin/i18n';

import { Dialog } from './Dialog.tsx';
import { Field } from './Field.tsx';
import { errorMessage } from './Banner.tsx';

/**
 * Task editor. Drafts survive a failed save: on CONFLICT the typed text is kept
 * and the user is offered a review of the latest version rather than having
 * their edit silently overwritten or discarded.
 */

export interface TaskDraft {
  readonly title: string;
  readonly assigneeId: string | null;
  readonly dueDate: string;
  readonly dueTime: string;
}

export function draftFromTask(task: TaskDto | null): TaskDraft {
  return {
    title: task?.title ?? '',
    assigneeId: task?.assignee_id ?? null,
    ...dueDraftFromIso(task?.due_at),
  };
}

export interface TaskEditorProps {
  readonly task: TaskDto | null;
  readonly members: readonly MemberDto[];
  readonly t: Translator;
  readonly pending: boolean;
  readonly error: CommandError | null;
  readonly conflict: boolean;
  readonly onCancel: () => void;
  readonly onReviewConflict: () => void;
  readonly onSubmit: (input: {
    readonly title: string;
    readonly assigneeId: string | null;
    readonly dueAt: string | null;
  }) => void;
}

function dueIssueKey(reason: 'invalid_format' | 'nonexistent_local_time'): TranslationKey {
  return reason === 'nonexistent_local_time'
    ? 'validation.due.nonexistent_local_time'
    : 'validation.due.invalid_format';
}

export function TaskEditor({
  task,
  members,
  t,
  pending,
  error,
  conflict,
  onCancel,
  onReviewConflict,
  onSubmit,
}: TaskEditorProps): ReactNode {
  const [draft, setDraft] = useState<TaskDraft>(() => draftFromTask(task));
  const [titleIssue, setTitleIssue] = useState<string | undefined>(undefined);
  const [dueIssue, setDueIssue] = useState<string | undefined>(undefined);

  const submit = (): void => {
    const issue = validateTitle(draft.title);
    const due = resolveDueInput(draft);
    setTitleIssue(issue === null ? undefined : t(issue.message_key as TranslationKey));
    setDueIssue(due.ok ? undefined : t(dueIssueKey(due.reason)));
    if (issue !== null || !due.ok) return;
    onSubmit({ title: draft.title.trim(), assigneeId: draft.assigneeId, dueAt: due.dueAt });
  };

  return (
    <Dialog
      footer={
        <>
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
    >
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

      {error !== null && !conflict && (
        <div className="banner banner--danger" role="alert">
          {errorMessage(error, t)}
        </div>
      )}

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

      <Field label={t('task.assignee.label')}>
        {(props) => (
          <select
            {...props}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                assigneeId: event.target.value === '' ? null : event.target.value,
              }))
            }
            value={draft.assigneeId ?? ''}
          >
            <option value="">{t('task.assignee.none')}</option>
            {members.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.display_name}
              </option>
            ))}
          </select>
        )}
      </Field>

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

      <button
        className="button button--quiet"
        onClick={() => setDraft((current) => ({ ...current, dueDate: '', dueTime: '' }))}
        type="button"
      >
        {t('task.due.clear')}
      </button>
    </Dialog>
  );
}
