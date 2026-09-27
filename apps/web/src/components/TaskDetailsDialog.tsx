import type { ReactNode } from 'react';

import type { MemberDto, TaskDto } from '@odin/contracts';
import { taskStatus } from '@odin/domain';
import type { Locale, Translator } from '@odin/i18n';

import { useTaskQuery } from '../app/queries.ts';
import { Avatar } from './Avatar.tsx';
import { Dialog } from './Dialog.tsx';

export function TaskDetailsDialog({
  taskId,
  members,
  locale,
  t,
  canEdit,
  onClose,
  onEdit,
}: {
  readonly taskId: string;
  readonly members: readonly MemberDto[];
  readonly locale: Locale;
  readonly t: Translator;
  readonly canEdit: boolean;
  readonly onClose: () => void;
  readonly onEdit: (task: TaskDto) => void;
}): ReactNode {
  const query = useTaskQuery(taskId);
  const task = query.isError ? undefined : query.data;
  const assignee = members.find((member) => member.user_id === task?.assignee_id);
  const dueAt = task?.due_at;
  const dueText =
    dueAt === null || dueAt === undefined
      ? t('task.due.none')
      : new Intl.DateTimeFormat(locale === 'bg' ? 'bg-BG' : 'en-GB', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(dueAt));

  return (
    <Dialog
      footer={
        <>
          {task !== undefined && canEdit && (
            <button className="button button--primary" onClick={() => onEdit(task)} type="button">
              {t('task.details.edit')}
            </button>
          )}
          <button className="button" onClick={onClose} type="button">
            {t('task.details.close')}
          </button>
        </>
      }
      onClose={onClose}
      title={task?.title ?? t('task.details.title')}
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
              {assignee === undefined ? (
                t('task.assignee.unassigned')
              ) : (
                <span className="chip">
                  <Avatar displayName={assignee.display_name} userId={assignee.user_id} />
                  {assignee.display_name}
                </span>
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
