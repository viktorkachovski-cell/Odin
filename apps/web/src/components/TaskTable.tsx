import type { CSSProperties, ReactNode } from 'react';

import type { DeadlineGroup, TaskGroup } from '@odin/domain';
import type { Translator } from '@odin/i18n';

/**
 * The frame every task list renders in: one surface, a column header on wide
 * screens, and rows laid out on a shared grid so List, Assignee and Due line up
 * down the page. On a phone the header hides and each row's metadata wraps
 * under its title.
 */
export function TaskTable({
  t,
  showList,
  showAssignee = true,
  reorder = false,
  children,
  before,
}: {
  readonly t: Translator;
  readonly showList: boolean;
  /** Off where every row is the member's own, such as Today's My tasks. */
  readonly showAssignee?: boolean;
  readonly reorder?: boolean;
  readonly children: ReactNode;
  /** Content inside the surface above the header, such as quick add. */
  readonly before?: ReactNode;
}): ReactNode {
  const columns = [
    '44px',
    'minmax(0, 1fr)',
    showList ? '9.5rem' : null,
    showAssignee ? '8.5rem' : null,
    '9rem',
    reorder ? '136px' : '44px',
  ]
    .filter((value) => value !== null)
    .join(' ');
  const style = { '--task-columns': columns } as CSSProperties;
  return (
    <div className={reorder ? 'task-table task-table--reorder' : 'task-table'} style={style}>
      {before}
      <div aria-hidden="true" className="task-table__header">
        <span />
        <span>{t('tasks.column.task')}</span>
        {showList && <span>{t('tasks.column.list')}</span>}
        {showAssignee && <span>{t('tasks.column.assignee')}</span>}
        <span>{t('tasks.column.due')}</span>
        <span />
      </div>
      {children}
    </div>
  );
}

const GROUP_KEYS: Record<DeadlineGroup, `tasks.group.${DeadlineGroup}`> = {
  overdue: 'tasks.group.overdue',
  today: 'tasks.group.today',
  upcoming: 'tasks.group.upcoming',
  undated: 'tasks.group.undated',
  done: 'tasks.group.done',
};

/** Deadline groups, each under its own heading with a count. */
export function TaskGroups<T>({
  groups,
  t,
  headingLevel = 2,
  renderRow,
  limit,
}: {
  readonly groups: readonly TaskGroup<T>[];
  readonly t: Translator;
  readonly headingLevel?: 2 | 3;
  readonly renderRow: (task: T) => ReactNode;
  /** Rows per group; the rest are summarised by the caller. */
  readonly limit?: number;
}): ReactNode {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <>
      {groups.map(({ group, tasks }) => (
        <section className="task-group" key={group}>
          <Heading className={`task-group__heading task-group__heading--${group}`}>
            {t(GROUP_KEYS[group])} · {tasks.length}
          </Heading>
          <ul className="task-list">
            {(limit === undefined ? tasks : tasks.slice(0, limit)).map(renderRow)}
          </ul>
        </section>
      ))}
    </>
  );
}
