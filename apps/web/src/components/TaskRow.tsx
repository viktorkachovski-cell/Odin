import type { ReactNode } from 'react';

import type { MemberDto, TaskRowModel } from '@odin/contracts';
import { isOverdue } from '@odin/domain';
import type { Locale, Translator } from '@odin/i18n';

import { Avatar } from './Avatar.tsx';
import { OverflowMenu, type OverflowItem } from './OverflowMenu.tsx';

/**
 * A task row is a flat set of sibling controls, never a clickable card with
 * buttons nested inside it. Toggling completion and opening the editor are
 * separate targets, so completing a task can never open the editor by accident.
 *
 * It renders a `TaskRowModel`, so the full list-detail task and the narrower
 * My Tasks / Unassigned projection share one component.
 *
 * Claim and Edit stay visible; Unassign and Delete live in the row's overflow.
 * A row used to end in four equal-weight buttons, which put Delete at the same
 * visual weight as Edit on the densest surface in the product.
 */

export interface TaskRowProps {
  readonly task: TaskRowModel;
  readonly members: readonly MemberDto[];
  readonly locale: Locale;
  readonly t: Translator;
  readonly busy?: boolean;
  readonly onToggleCompleted?: ((task: TaskRowModel, completed: boolean) => void) | undefined;
  readonly onEdit?: ((task: TaskRowModel) => void) | undefined;
  readonly onClaim?: ((task: TaskRowModel) => void) | undefined;
  readonly onUnassign?: ((task: TaskRowModel) => void) | undefined;
  readonly onDelete?: ((task: TaskRowModel) => void) | undefined;
}

function TaskActions({
  task,
  busy,
  t,
  onClaim,
  onEdit,
  onUnassign,
  onDelete,
}: Pick<
  TaskRowProps,
  'task' | 'busy' | 't' | 'onClaim' | 'onEdit' | 'onUnassign' | 'onDelete'
>): ReactNode {
  const overflowItems: OverflowItem[] = [];

  if (onUnassign !== undefined && task.assignee_id !== null) {
    overflowItems.push({
      key: 'unassign',
      label: t('task.unassign.short'),
      glyph: '↺',
      onSelect: () => onUnassign(task),
    });
  }
  if (onDelete !== undefined) {
    overflowItems.push({
      key: 'delete',
      label: t('task.delete.short'),
      glyph: '⌫',
      danger: true,
      onSelect: () => onDelete(task),
    });
  }

  if (onClaim === undefined && onEdit === undefined && overflowItems.length === 0) return null;

  return (
    <div className="task-row__actions">
      {onClaim !== undefined && (
        <button
          className="button button--accent"
          disabled={busy}
          onClick={() => onClaim(task)}
          type="button"
        >
          {t('task.claim', { title: task.title })}
        </button>
      )}
      {onEdit !== undefined && (
        <button
          aria-label={t('task.edit_action', { title: task.title })}
          className="button button--quiet"
          disabled={busy}
          onClick={() => onEdit(task)}
          type="button"
        >
          {t('task.edit_action.short')}
        </button>
      )}
      {overflowItems.length > 0 && (
        <OverflowMenu
          disabled={busy}
          items={overflowItems}
          label={t('task.actions', { title: task.title })}
        />
      )}
    </div>
  );
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
  onToggleCompleted,
  onEdit,
  onClaim,
  onUnassign,
  onDelete,
}: TaskRowProps): ReactNode {
  const assignee = members.find((member) => member.user_id === task.assignee_id);
  const overdue = isOverdue(task);

  return (
    <li className={task.completed ? 'task-row task-row--done' : 'task-row'}>
      {onToggleCompleted !== undefined && (
        <button
          aria-pressed={task.completed}
          className="task-row__toggle"
          disabled={busy}
          onClick={() => onToggleCompleted(task, !task.completed)}
          type="button"
        >
          <span aria-hidden="true">{task.completed ? '✓' : '☐'}</span>
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
        {task.notes !== undefined && task.notes !== null && (
          <p className="task-row__notes" title={task.notes}>
            {task.notes}
          </p>
        )}

        <div className="task-row__meta">
          {task.list_title !== undefined && (
            <span>{t('task.in_list', { list: task.list_title })}</span>
          )}

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

      <TaskActions
        busy={busy}
        onClaim={onClaim}
        onDelete={onDelete}
        onEdit={onEdit}
        onUnassign={onUnassign}
        t={t}
        task={task}
      />
    </li>
  );
}
