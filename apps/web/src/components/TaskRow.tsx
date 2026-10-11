import type { ReactNode } from 'react';

import type { MemberDto, MoveDirection, TaskRowModel, TaskState } from '@odin/contracts';
import { isOverdue, taskRowActions, type TaskRowAction } from '@odin/domain';
import { formatDueShort, TASK_ACTION_KEYS, type Locale, type Translator } from '@odin/i18n';

import { Avatar } from './Avatar.tsx';
import { MoveButtons } from './Controls.tsx';
import { Icon } from './Icon.tsx';
import { OverflowMenu, type OverflowItem } from './OverflowMenu.tsx';

/**
 * One row of a task table: completion, title, list, assignee, deadline and a
 * single overflow menu. It shows exceptions, not defaults -- a status label
 * appears only when the task is Blocked, an empty deadline is an empty cell,
 * and an unclaimed task offers Claim instead of an "Unassigned" chip.
 *
 * Every control is a sibling, never nested in a clickable row: completing a
 * task can never open it. The title opens the task panel, where it is edited.
 * Move controls render only when the caller is in reorder mode.
 */

interface TaskRowProps {
  readonly task: TaskRowModel;
  readonly members: readonly MemberDto[];
  readonly locale: Locale;
  readonly t: Translator;
  readonly busy?: boolean | undefined;
  /** Defaults to showing the list column whenever the row knows its list. */
  readonly showList?: boolean | undefined;
  readonly showAssignee?: boolean | undefined;
  readonly now?: Date | undefined;
  readonly onToggleCompleted?: ((task: TaskRowModel, completed: boolean) => void) | undefined;
  readonly onOpenDetails?: ((task: TaskRowModel) => void) | undefined;
  readonly onClaim?: ((task: TaskRowModel) => void) | undefined;
  /** Offered as Mark blocked / Unblock in the row menu. */
  readonly onSetState?: ((task: TaskRowModel, state: TaskState) => void) | undefined;
  readonly onUnassign?: ((task: TaskRowModel) => void) | undefined;
  readonly onDelete?: ((task: TaskRowModel) => void) | undefined;
  readonly onMove?: ((task: TaskRowModel, direction: MoveDirection) => void) | undefined;
  readonly moveUpDisabled?: boolean | undefined;
  readonly moveDownDisabled?: boolean | undefined;
}

function menuItems({
  task,
  t,
  onSetState,
  onUnassign,
  onDelete,
}: Pick<TaskRowProps, 'task' | 't' | 'onSetState' | 'onUnassign' | 'onDelete'>): OverflowItem[] {
  const run: Record<TaskRowAction, () => void> = {
    block: () => onSetState?.(task, 'blocked'),
    unblock: () => onSetState?.(task, 'open'),
    unassign: () => onUnassign?.(task),
    delete: () => onDelete?.(task),
  };
  const wired = {
    state: onSetState !== undefined,
    unassign: onUnassign !== undefined,
    remove: onDelete !== undefined,
  };
  return taskRowActions(task, wired).map((action) => ({
    key: action,
    label: t(TASK_ACTION_KEYS[action]),
    danger: action === 'delete',
    onSelect: run[action],
  }));
}

function Toggle({
  task,
  t,
  busy,
  onToggleCompleted,
}: Pick<TaskRowProps, 'task' | 't' | 'busy' | 'onToggleCompleted'>): ReactNode {
  if (onToggleCompleted === undefined) return <span className="task-row__toggle-slot" />;
  return (
    <button
      aria-pressed={task.completed}
      className="task-row__toggle"
      disabled={busy}
      onClick={() => onToggleCompleted(task, !task.completed)}
      type="button"
    >
      <span aria-hidden="true" className="task-row__box">
        {task.completed && <Icon name="check" size={16} />}
      </span>
      <span className="visually-hidden">
        {task.completed
          ? t('task.incomplete', { title: task.title })
          : t('task.complete', { title: task.title })}
      </span>
    </button>
  );
}

function TitleCell({ task, t, onOpenDetails }: Pick<TaskRowProps, 'task' | 't' | 'onOpenDetails'>) {
  const titleClass = task.completed ? 'task-row__title task-row__title--done' : 'task-row__title';
  return (
    <div className="task-row__main">
      <span className="task-row__headline">
        {onOpenDetails === undefined ? (
          <span className={titleClass}>{task.title}</span>
        ) : (
          <button
            className={`${titleClass} task-row__title-button`}
            onClick={() => onOpenDetails(task)}
            type="button"
          >
            {task.title}
          </button>
        )}
        {task.blocked === true && !task.completed && (
          <span className="status-pill status-pill--blocked">
            <Icon name="blocked" size={12} />
            {t('task.status.blocked')}
          </span>
        )}
      </span>
      {task.notes !== undefined && task.notes !== null && task.notes.length > 0 && (
        <span className="task-row__notes" title={task.notes}>
          {task.notes}
        </span>
      )}
    </div>
  );
}

function AssigneeCell({
  task,
  members,
  t,
  busy,
  onClaim,
}: Pick<TaskRowProps, 'task' | 'members' | 't' | 'busy' | 'onClaim'>): ReactNode {
  const assignee = members.find((member) => member.user_id === task.assignee_id);
  if (assignee !== undefined) {
    return (
      <span className="task-row__cell task-row__assignee">
        <Avatar displayName={assignee.display_name} userId={assignee.user_id} />
        {assignee.display_name}
      </span>
    );
  }
  if (task.assignee_id === null && onClaim !== undefined && !task.completed) {
    return (
      <span className="task-row__cell">
        <button
          aria-label={t('task.claim', { title: task.title })}
          className="button button--accent button--compact"
          disabled={busy}
          onClick={() => onClaim(task)}
          type="button"
        >
          {t('task.claim.short')}
        </button>
      </span>
    );
  }
  return (
    <span className="task-row__cell">
      {task.assignee_id === null && (
        <span className="visually-hidden">{t('task.assignee.unassigned')}</span>
      )}
    </span>
  );
}

function DueCell({ task, locale, t, now }: Pick<TaskRowProps, 'task' | 'locale' | 't' | 'now'>) {
  if (task.due_at === null) return <span className="task-row__cell task-row__due" />;
  const date = formatDueShort(task.due_at, locale, now);
  return isOverdue(task, now) ? (
    <span className="task-row__cell task-row__due overdue">{t('task.overdue_on', { date })}</span>
  ) : (
    <span className="task-row__cell task-row__due">{date}</span>
  );
}

function Actions(props: TaskRowProps): ReactNode {
  const { task, t, busy, onMove, moveUpDisabled, moveDownDisabled } = props;
  const items = menuItems(props);
  return (
    <span className="task-row__actions">
      {onMove !== undefined && (
        <MoveButtons
          downDisabled={busy === true || moveDownDisabled === true}
          label={(direction) => t(`task.move.${direction}`, { title: task.title })}
          onMove={(direction) => onMove(task, direction)}
          upDisabled={busy === true || moveUpDisabled === true}
        />
      )}
      {items.length > 0 && (
        <OverflowMenu
          disabled={busy}
          items={items}
          label={t('task.actions', { title: task.title })}
        />
      )}
    </span>
  );
}

export function TaskRow(props: TaskRowProps): ReactNode {
  const { task, members, locale, t, busy = false, now } = props;
  const showList = props.showList ?? task.list_title !== undefined;
  return (
    <li className={task.completed ? 'task-row task-row--done' : 'task-row'}>
      <Toggle busy={busy} onToggleCompleted={props.onToggleCompleted} t={t} task={task} />
      <TitleCell onOpenDetails={props.onOpenDetails} t={t} task={task} />
      <span className="task-row__meta">
        {showList && <span className="task-row__cell task-row__list">{task.list_title}</span>}
        {props.showAssignee !== false && (
          <AssigneeCell busy={busy} members={members} onClaim={props.onClaim} t={t} task={task} />
        )}
        <DueCell locale={locale} now={now} t={t} task={task} />
      </span>
      <Actions {...props} busy={busy} />
    </li>
  );
}
