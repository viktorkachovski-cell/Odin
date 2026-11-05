import type { ReactNode } from 'react';

import type { MemberDto } from '@odin/contracts';
import { assigneeEntries, taskAssigneeIds, taskStatus } from '@odin/domain';
import { formatDueAt, type Locale, type Translator } from '@odin/i18n';

import { useTaskQuery } from '../app/queries.ts';
import { Avatar } from './Avatar.tsx';
import { Dialog } from './Dialog.tsx';

/** A task read-only: a template task, or any task while it loads or fails to. */
export function TaskDetailsDialog({
  taskId,
  members,
  locale,
  t,
  onClose,
}: {
  readonly taskId: string;
  readonly members: readonly MemberDto[];
  readonly locale: Locale;
  readonly t: Translator;
  readonly onClose: () => void;
}): ReactNode {
  const query = useTaskQuery(taskId);
  const task = query.isError ? undefined : query.data;
  const assignees = task === undefined ? [] : assigneeEntries(taskAssigneeIds(task), members, null);
  const dueAt = task?.due_at;
  const dueText =
    dueAt === null || dueAt === undefined ? t('task.due.none') : formatDueAt(dueAt, locale);

  return (
    <Dialog
      footer={
        <button className="button" onClick={onClose} type="button">
          {t('task.details.close')}
        </button>
      }
      onClose={onClose}
      title={task?.title ?? t('task.details.title')}
      variant="side"
    >
      {query.isPending && <p role="status">{t('task.details.loading')}</p>}
      {query.isError && (
        <div className="banner banner--danger" role="alert">
          <p>{t('task.details.error')}</p>
          <button className="button" onClick={() => void query.refetch()} type="button">
            {t('state.retry')}
          </button>
        </div>
      )}
      {task !== undefined && (
        <dl className="task-details">
          <div>
            <dt>{t('task.details.notes')}</dt>
            <dd>{task.notes ?? '—'}</dd>
          </div>
          <div>
            <dt>{t('task.assignee.label')}</dt>
            <dd>
              {assignees.length === 0 ? (
                t('task.assignee.unassigned')
              ) : (
                <ul className="chip-list">
                  {assignees.map((assignee) => (
                    <li className="chip" key={assignee.userId}>
                      {!assignee.former && (
                        <Avatar
                          displayName={assignee.name}
                          members={members}
                          userId={assignee.userId}
                        />
                      )}
                      {assignee.former ? t('task.assignee.former') : assignee.name}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
          <div>
            <dt>{t('task.due.label')}</dt>
            <dd>{dueText}</dd>
          </div>
          <div>
            <dt>{t('task.status.label')}</dt>
            <dd>{t(`task.status.${taskStatus(task)}`)}</dd>
          </div>
        </dl>
      )}
    </Dialog>
  );
}
