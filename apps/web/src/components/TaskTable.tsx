import type { CSSProperties, ReactNode } from 'react';

import type { TaskGroup } from '@odin/domain';
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

/** Deadline groups, each under its own heading with a count. */
export function TaskGroups<T>({
  groups,
  t,
  headingLevel = 2,
  renderRow,
}: {
  readonly groups: readonly TaskGroup<T>[];
  readonly t: Translator;
  readonly headingLevel?: 2 | 3;
  readonly renderRow: (task: T) => ReactNode;
}): ReactNode {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <>
      {groups.map(({ group, tasks }) => (
        <section className="task-group" key={group}>
          <Heading className={`task-group__heading task-group__heading--${group}`}>
            {t(`tasks.group.${group}`)} · {tasks.length}
          </Heading>
          <ul className="task-list">{tasks.map(renderRow)}</ul>
        </section>
      ))}
    </>
  );
}
