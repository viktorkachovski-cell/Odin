import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';

import { taskRowFromHouseholdTask, type HouseholdTaskDto, type MemberDto } from '@odin/contracts';
import { filterTasks, groupTasksByDeadline, sortTasksByDue, summarizeTasks } from '@odin/domain';
import { formatDueShort, type Translator } from '@odin/i18n';

import { useOdin } from '../app/OdinContext.ts';
import { useHomeQuery, useHouseholdTasksQuery, useMembersQuery } from '../app/queries.ts';
import { ErrorBanner } from '../components/Banner.tsx';
import { Fab } from '../components/Fab.tsx';
import { Icon } from '../components/Icon.tsx';
import { NewTaskEditor } from '../components/NewTaskEditor.tsx';
import { TaskRow } from '../components/TaskRow.tsx';
import { TaskGroups, TaskTable } from '../components/TaskTable.tsx';
import { useTaskWiring } from '../components/useTaskWiring.tsx';
import { ListProgressLink } from './ListsParts.tsx';

/**
 * Today: what needs attention, before anything else. Four counts that open the
 * matching Tasks filter, the member's own work by deadline, a short list of
 * unclaimed work and list progress. Everything comes from the one household
 * read Tasks also uses, so the two screens never disagree.
 */

const GRAB_LIMIT = 3;
const LIST_LIMIT = 5;
const ALL = { preset: 'all' } as const;

function Tiles({
  t,
  summary,
}: {
  readonly t: Translator;
  readonly summary: ReturnType<typeof summarizeTasks>;
}): ReactNode {
  const tiles = [
    {
      key: 'overdue',
      label: t('today.tile.overdue'),
      value: summary.overdue,
      to: '/tasks?view=everyone&deadline=overdue',
      tone: 'danger',
    },
    {
      key: 'today',
      label: t('today.tile.due_today'),
      value: summary.dueToday,
      to: '/tasks?view=everyone&deadline=today',
      tone: '',
    },
    {
      key: 'unassigned',
      label: t('today.tile.unassigned'),
      value: summary.unassigned,
      to: '/tasks?view=unassigned',
      tone: '',
    },
    {
      key: 'blocked',
      label: t('today.tile.blocked'),
      value: summary.blocked,
      to: '/tasks?view=everyone&blocked=1',
      tone: 'warning',
    },
  ];
  return (
    <ul className="tiles">
      {tiles.map((tile) => (
        <li key={tile.key}>
          <Link aria-label={`${tile.label}: ${String(tile.value)}`} className="tile" to={tile.to}>
            <span className="tile__label">{tile.label}</span>
            <span
              className={
                tile.tone.length > 0 && tile.value > 0
                  ? `tile__value tile__value--${tile.tone}`
                  : 'tile__value'
              }
            >
              {tile.value}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function UpForGrabs({
  tasks,
  t,
  busy,
  onClaim,
}: {
  readonly tasks: readonly HouseholdTaskDto[];
  readonly t: Translator;
  readonly busy: boolean;
  readonly onClaim: (task: HouseholdTaskDto) => void;
}): ReactNode {
  const { locale } = useOdin();
  return (
    <section aria-labelledby="grabs-heading" className="panel">
      <div className="panel__header">
        <h2 className="panel__title" id="grabs-heading">
          {t('today.grabs.heading')}
        </h2>
        {tasks.length > 0 && (
          <Link className="panel__link" to="/tasks?view=unassigned">
            {t('today.grabs.all', { count: tasks.length })}
          </Link>
        )}
      </div>
      {tasks.length === 0 ? (
        <p className="panel__empty">{t('unassigned.empty')}</p>
      ) : (
        <ul className="compact-list">
          {tasks.slice(0, GRAB_LIMIT).map((task) => (
            <li className="compact-list__row" key={task.id}>
              <span className="compact-list__text">
                <span className="compact-list__title">{task.title}</span>
                <span className="compact-list__meta">
                  {task.due_at === null
                    ? task.list_title
                    : `${task.list_title} · ${formatDueShort(task.due_at, locale)}`}
                </span>
              </span>
              <button
                aria-label={t('task.claim', { title: task.title })}
                className="button button--accent"
                disabled={busy}
                onClick={() => onClaim(task)}
                type="button"
              >
                {t('task.claim.short')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ListsPanel({ t }: { readonly t: Translator }): ReactNode {
  const home = useHomeQuery();
  const active = (home.data?.items ?? []).filter((item) => item.kind === 'active');
  return (
    <section aria-labelledby="lists-heading" className="panel">
      <div className="panel__header">
        <h2 className="panel__title" id="lists-heading">
          {t('today.lists.heading')}
        </h2>
        <Link className="panel__link" to="/lists">
          {t('today.lists.all')}
        </Link>
      </div>
      {active.length === 0 ? (
        <p className="panel__empty">{t('home.active.empty')}</p>
      ) : (
        <ul className="compact-list">
          {active.slice(0, LIST_LIMIT).map((list) => (
            <li key={list.id}>
              <ListProgressLink list={list} t={t} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MyTasksPanel({
  items,
  userId,
  now,
  wiring,
  members,
}: {
  readonly items: readonly HouseholdTaskDto[];
  readonly userId: string | null;
  readonly now: Date;
  readonly wiring: ReturnType<typeof useTaskWiring>;
  readonly members: readonly MemberDto[];
}): ReactNode {
  const { t, locale } = useOdin();
  const mine = filterTasks(items, { view: 'mine', userId, deadline: ALL }, now);
  const groups = groupTasksByDeadline(mine, now);
  // Undated work is summarised by a link unless it is all the member has.
  const dated = groups.filter((group) => group.group !== 'undated');
  const shown = dated.length > 0 ? dated : groups;
  const undatedCount =
    dated.length > 0 ? mine.length - dated.reduce((sum, group) => sum + group.tasks.length, 0) : 0;
  return (
    <section aria-labelledby="mine-heading" className="panel">
      <div className="panel__header">
        <h2 className="panel__title" id="mine-heading">
          {t('today.mine.heading')}
        </h2>
        <Link className="panel__link" to="/tasks?view=mine">
          {t('today.mine.open_all')}
        </Link>
      </div>
      {mine.length === 0 ? (
        <p className="panel__empty">{t('today.mine.empty')}</p>
      ) : (
        <TaskTable showAssignee={false} showList t={t}>
          <TaskGroups
            groups={shown}
            headingLevel={3}
            renderRow={(task) => (
              <TaskRow
                {...wiring.handlers}
                key={task.id}
                locale={locale}
                members={members}
                now={now}
                showAssignee={false}
                t={t}
                task={taskRowFromHouseholdTask(task)}
              />
            )}
            t={t}
          />
          {undatedCount > 0 && (
            <Link className="task-table__more" to="/tasks?view=mine&deadline=undated">
              {t('today.mine.undated_more', { count: undatedCount })}
            </Link>
          )}
        </TaskTable>
      )}
    </section>
  );
}

export function Today(): ReactNode {
  const { t, locale, user } = useOdin();
  const query = useHouseholdTasksQuery();
  const home = useHomeQuery();
  const members = useMembersQuery();
  const memberList = members.data ?? [];
  const wiring = useTaskWiring({ members: memberList });
  const [creating, setCreating] = useState(false);

  if (query.isPending) return <p role="status">{t('state.loading')}</p>;
  if (query.isError) {
    return (
      <ErrorBanner
        error={{ code: 'UNKNOWN', message_key: 'error.unknown' }}
        onRetry={() => void query.refetch()}
        t={t}
      />
    );
  }

  const now = new Date();
  const items = query.data.items;
  const userId = user?.id ?? null;
  const unassigned = sortTasksByDue(
    filterTasks(items, { view: 'unassigned', userId, deadline: ALL }, now),
  );
  const canCreate = (home.data?.items ?? []).some((list) => list.kind === 'active');
  const dateLine = new Intl.DateTimeFormat(locale === 'bg' ? 'bg-BG' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);

  return (
    <>
      <div className="page-header">
        <div className="page-header__titles">
          <h1>{t('today.title')}</h1>
          <span className="page-header__sub">{dateLine}</span>
        </div>
        <button
          className="button button--primary page-header__primary"
          disabled={!canCreate}
          onClick={() => setCreating(true)}
          type="button"
        >
          <Icon name="plus" size={18} />
          {t('tasks.new')}
        </button>
      </div>

      {wiring.errors}

      <Tiles summary={summarizeTasks(items, userId, now)} t={t} />

      <div className="today-grid">
        <MyTasksPanel
          items={items}
          members={memberList}
          now={now}
          userId={userId}
          wiring={wiring}
        />
        <div className="today-grid__side">
          <UpForGrabs
            busy={wiring.actions.busy}
            onClaim={(task) => wiring.actions.claim(taskRowFromHouseholdTask(task))}
            t={t}
            tasks={unassigned}
          />
          <ListsPanel t={t} />
        </div>
      </div>

      {canCreate && <Fab label={t('tasks.new')} onClick={() => setCreating(true)} />}
      {wiring.overlays}
      {creating && (
        <NewTaskEditor
          lists={home.data?.items ?? []}
          members={memberList}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}
