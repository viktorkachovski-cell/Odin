import type { ReactNode } from 'react';

import type { MemberDto, MoveDirection, TaskRowModel, TaskState } from '@odin/contracts';
import {
  assigneeEntries,
  isOverdue,
  summarizeAssignees,
  taskAssigneeIds,
  taskRowActions,
  type TaskRowAction,
} from '@odin/domain';
import { formatDueShort, TASK_ACTION_KEYS, type Locale, type Translator } from '@odin/i18n';

import { Avatar } from './Avatar.tsx';
import { MoveButtons } from './Controls.tsx';
import { Icon } from './Icon.tsx';
import { OverflowMenu, type OverflowItem } from './OverflowMenu.tsx';

/**
 * One row of a task table: completion, title, list, assignee, deadline and a
 * single overflow menu. It shows exceptions, not defaults -- a status label
 * appears only when the task is Blocked, an empty deadline is an empty cell,
 * and a task nobody has offers Assign to me instead of an "Unassigned" chip.
 * Several assignees show as the first two names and a count; every name is
 * still read out and available on hover.
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
  /** The signed-in member, for "You" and the Assign to me / Remove me menu items. */
  readonly currentUserId?: string | null | undefined;
  readonly onAssignMe?: ((task: TaskRowModel) => void) | undefined;
  readonly onRemoveMe?: ((task: TaskRowModel) => void) | undefined;
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
  currentUserId,
  onSetState,
  onAssignMe,
  onRemoveMe,
  onUnassign,
  onDelete,
}: Pick<
  TaskRowProps,
  | 'task'
  | 't'
  | 'currentUserId'
  | 'onSetState'
  | 'onAssignMe'
  | 'onRemoveMe'
  | 'onUnassign'
  | 'onDelete'
>): OverflowItem[] {
  const run: Record<TaskRowAction, () => void> = {
    block: () => onSetState?.(task, 'blocked'),
    unblock: () => onSetState?.(task, 'open'),
    assign_me: () => onAssignMe?.(task),
    remove_me: () => onRemoveMe?.(task),
    unassign: () => onUnassign?.(task),
    delete: () => onDelete?.(task),
  };
  const wired = {
    state: onSetState !== undefined,
    assignMe: onAssignMe !== undefined,
    removeMe: onRemoveMe !== undefined,
    unassign: onUnassign !== undefined,
    remove: onDelete !== undefined,
  };
  return taskRowActions(task, wired, currentUserId ?? null).map((action) => ({
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
  currentUserId,
  t,
  busy,
  onAssignMe,
}: Pick<
  TaskRowProps,
  'task' | 'members' | 'currentUserId' | 't' | 'busy' | 'onAssignMe'
>): ReactNode {
  const ids = taskAssigneeIds(task);
  if (ids.length === 0) {
    if (onAssignMe !== undefined && !task.completed) {
      return (
        <span className="task-row__cell">
          <button
            aria-label={t('task.claim', { title: task.title })}
            className="button button--accent button--compact"
            disabled={busy}
            onClick={() => onAssignMe(task)}
            type="button"
          >
            {t('task.claim.short')}
          </button>
        </span>
      );
    }
    return (
      <span className="task-row__cell">
        <span className="visually-hidden">{t('task.assignee.unassigned')}</span>
      </span>
    );
  }
  const entries = assigneeEntries(ids, members, currentUserId);
  const { shown, more } = summarizeAssignees(entries);
  const nameOf = (entry: (typeof entries)[number]): string =>
    entry.former ? t('task.assignee.former') : entry.isYou ? t('task.assignee.you') : entry.name;
  const everyone = entries.map(nameOf).join(', ');
  return (
    <span className="task-row__cell task-row__assignees" title={everyone}>
      <span aria-hidden={more > 0 ? true : undefined} className="task-row__assignees">
        {shown.map((entry) => (
          <span className="task-row__assignee" key={entry.userId}>
            {!entry.former && (
              <Avatar displayName={entry.name} members={members} userId={entry.userId} />
            )}
            <span className="task-row__assignee-name">{nameOf(entry)}</span>
          </span>
        ))}
        {more > 0 && (
          <span className="task-row__more">{t('task.assignee.more', { count: more })}</span>
        )}
      </span>
      {more > 0 && (
        <span className="visually-hidden">{t('task.assignee.summary', { names: everyone })}</span>
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
          <AssigneeCell
            busy={busy}
            currentUserId={props.currentUserId}
            members={members}
            onAssignMe={props.onAssignMe}
            t={t}
            task={task}
          />
        )}
        <DueCell locale={locale} now={now} t={t} task={task} />
      </span>
      <Actions {...props} busy={busy} />
    </li>
  );
}
