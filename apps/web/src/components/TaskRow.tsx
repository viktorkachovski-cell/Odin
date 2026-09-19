import type { ReactNode } from 'react';

import type { MemberDto, TaskDto } from '@odin/contracts';
import { isOverdue } from '@odin/domain';
import type { Locale, Translator } from '@odin/i18n';

import { Avatar } from './Avatar.tsx';

/**
 * A task row is a flat set of sibling controls, never a clickable card with
 * buttons nested inside it. Toggling completion and opening the editor are
 * separate targets, so completing a task can never open the editor by accident.
 */

export interface TaskRowProps {
  readonly task: TaskDto;
  readonly members: readonly MemberDto[];
  readonly locale: Locale;
  readonly t: Translator;
  readonly busy?: boolean;
  readonly listTitle?: string | undefined;
  readonly onToggleCompleted?: ((task: TaskDto, completed: boolean) => void) | undefined;
  readonly onEdit?: ((task: TaskDto) => void) | undefined;
  readonly onClaim?: ((task: TaskDto) => void) | undefined;
}

function formatDue(due_at: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'bg' ? 'bg-BG' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(due_at));
}

export function TaskRow({
  task,
  members,
  locale,
  t,
  busy = false,
  listTitle,
  onToggleCompleted,
  onEdit,
  onClaim,
}: TaskRowProps): ReactNode {
  const assignee = members.find((member) => member.user_id === task.assignee_id);
  const overdue = isOverdue(task);

  return (
    <li className="task-row">
      {onToggleCompleted !== undefined && (
        <button
          aria-pressed={task.completed}
          className="task-row__toggle"
          disabled={busy}
          onClick={() => onToggleCompleted(task, !task.completed)}
          type="button"
        >
          <span aria-hidden="true">{task.completed ? '☑' : '☐'}</span>
          <span className="visually-hidden">
            {task.completed
              ? t('task.incomplete', { title: task.title })
              : t('task.complete', { title: task.title })}
          </span>
        </button>
      )}

      <div className="task-row__body">
        <span
          className={task.completed ? 'task-row__title task-row__title--done' : 'task-row__title'}
        >
          {task.title}
        </span>

        <div className="task-row__meta">
          {listTitle !== undefined && <span>{t('task.in_list', { list: listTitle })}</span>}

          {assignee === undefined ? (
            <span className="chip">{t('task.assignee.unassigned')}</span>
          ) : (
            <span className="chip">
              <Avatar displayName={assignee.display_name} userId={assignee.user_id} />
              {assignee.display_name}
            </span>
          )}

          {task.due_at === null ? (
            <span>{t('task.due.none')}</span>
          ) : (
            <span className={overdue ? 'overdue' : undefined}>
              {/* Overdue is spelled out; colour alone would not be enough. */}
              {overdue ? `${t('task.overdue')} · ` : ''}
              {formatDue(task.due_at, locale)}
            </span>
          )}
        </div>
      </div>

      <div className="task-row__actions">
        {onClaim !== undefined && (
          <button className="button" disabled={busy} onClick={() => onClaim(task)} type="button">
            {t('task.claim', { title: task.title })}
          </button>
        )}
        {onEdit !== undefined && (
          <button
            className="button button--quiet"
            disabled={busy}
            onClick={() => onEdit(task)}
            type="button"
          >
            {t('task.edit_action', { title: task.title })}
          </button>
        )}
      </div>
    </li>
  );
}
