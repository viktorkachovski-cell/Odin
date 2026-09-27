import type { ReactNode } from 'react';

import type { MemberDto, MoveDirection, TaskRowModel, TaskState } from '@odin/contracts';
import { isOverdue, taskState, taskStatusOptions } from '@odin/domain';
import { formatDueAt, type Locale, type Translator } from '@odin/i18n';

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
  readonly onSetState?: ((task: TaskRowModel, state: TaskState) => void) | undefined;
  readonly onMove?: ((task: TaskRowModel, direction: MoveDirection) => void) | undefined;
  readonly moveUpDisabled?: boolean | undefined;
  readonly moveDownDisabled?: boolean | undefined;
  readonly onOpenDetails?: ((task: TaskRowModel) => void) | undefined;
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
  onMove,
  moveUpDisabled,
  moveDownDisabled,
}: Pick<
  TaskRowProps,
  | 'task'
  | 'busy'
  | 't'
  | 'onClaim'
  | 'onEdit'
  | 'onUnassign'
  | 'onDelete'
  | 'onMove'
  | 'moveUpDisabled'
  | 'moveDownDisabled'
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

  if (
    onClaim === undefined &&
    onEdit === undefined &&
    onMove === undefined &&
    overflowItems.length === 0
  )
    return null;

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
      {onMove !== undefined && (
        <>
          <button
            aria-label={t('task.move.up', { title: task.title })}
            className="button button--quiet task-row__move"
            disabled={busy || moveUpDisabled}
            onClick={() => onMove(task, 'up')}
            type="button"
          >
            <span aria-hidden="true">↑</span>
          </button>
          <button
            aria-label={t('task.move.down', { title: task.title })}
            className="button button--quiet task-row__move"
            disabled={busy || moveDownDisabled}
            onClick={() => onMove(task, 'down')}
            type="button"
          >
            <span aria-hidden="true">↓</span>
          </button>
        </>
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

function StatusSelect({
  task,
  t,
  busy,
  onSetState,
}: {
  readonly task: TaskRowModel;
  readonly t: Translator;
  readonly busy: boolean | undefined;
  readonly onSetState: (task: TaskRowModel, state: TaskState) => void;
}): ReactNode {
  const options = taskStatusOptions(task);
  return (
    <label className="task-row__status">
      <span className="visually-hidden">{t('task.status.change', { title: task.title })}</span>
      <select
        aria-label={t('task.status.change', { title: task.title })}
        disabled={busy}
        onChange={(event) => {
          const chosen = options.find((option) => option.state === event.target.value);
          if (chosen !== undefined) onSetState(task, chosen.state);
        }}
        value={taskState(task)}
      >
        {options.map((option) => (
          <option key={option.state} value={option.state}>
            {t(`task.status.${option.status}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

function TaskMeta({
  task,
  members,
  locale,
  t,
  busy,
  onSetState,
}: Pick<TaskRowProps, 'task' | 'members' | 'locale' | 't' | 'busy' | 'onSetState'>): ReactNode {
  const assignee = members.find((member) => member.user_id === task.assignee_id);
  const overdue = isOverdue(task);
  return (
    <div className="task-row__meta">
      {onSetState !== undefined && (
        <StatusSelect busy={busy} onSetState={onSetState} t={t} task={task} />
      )}
      {task.list_title !== undefined && <span>{t('task.in_list', { list: task.list_title })}</span>}
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
          {overdue ? `${t('task.overdue')} · ` : ''}
          {formatDueAt(task.due_at, locale)}
        </span>
      )}
    </div>
  );
}

export function TaskRow({
  task,
  members,
  locale,
  t,
  busy = false,
  onToggleCompleted,
  onSetState,
  onOpenDetails,
  onEdit,
  onClaim,
  onUnassign,
  onDelete,
  onMove,
  moveUpDisabled,
  moveDownDisabled,
}: TaskRowProps): ReactNode {
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
        {onOpenDetails === undefined ? (
          <span
            className={task.completed ? 'task-row__title task-row__title--done' : 'task-row__title'}
          >
            {task.title}
          </span>
        ) : (
          <button
            className={
              task.completed
                ? 'task-row__title task-row__title--done task-row__title-button'
                : 'task-row__title task-row__title-button'
            }
            onClick={() => onOpenDetails(task)}
            type="button"
          >
            {task.title}
          </button>
        )}
        {task.notes !== undefined && task.notes !== null && (
          <p className="task-row__notes" title={task.notes}>
            {task.notes}
          </p>
        )}

        <TaskMeta
          busy={busy}
          locale={locale}
          members={members}
          onSetState={onSetState}
          t={t}
          task={task}
        />
      </div>

      <TaskActions
        busy={busy}
        onClaim={onClaim}
        onDelete={onDelete}
        onEdit={onEdit}
        onMove={onMove}
        onUnassign={onUnassign}
        moveUpDisabled={moveUpDisabled}
        moveDownDisabled={moveDownDisabled}
        t={t}
        task={task}
      />
    </li>
  );
}
