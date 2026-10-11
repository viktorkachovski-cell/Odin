import { useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';

import { taskRowFromHouseholdTask } from '@odin/contracts';
import {
  filterTasks,
  groupTasksByDeadline,
  isTaskView,
  resolveTaskDeadlineFilter,
  TASK_DEADLINE_PRESETS,
  type TaskDeadlineFilter,
  type TaskDeadlinePreset,
  type TaskView,
} from '@odin/domain';
import type { Translator } from '@odin/i18n';

import { useOdin } from '../app/OdinContext.ts';
import { useHomeQuery, useHouseholdTasksQuery, useMembersQuery } from '../app/queries.ts';
import { ErrorBanner } from '../components/Banner.tsx';
import { Fab } from '../components/Fab.tsx';
import { Icon } from '../components/Icon.tsx';
import { NewTaskEditor } from '../components/NewTaskEditor.tsx';
import { TaskRow } from '../components/TaskRow.tsx';
import { TaskGroups, TaskTable } from '../components/TaskTable.tsx';
import { useTaskWiring } from '../components/useTaskWiring.tsx';

/**
 * Tasks: one register replacing My Tasks, Unassigned and All tasks. Whose
 * tasks, deadline, search and done are filters over a single household read,
 * held in the URL so a filtered view can be linked to and survives a reload.
 */

function isPreset(value: string | null): value is TaskDeadlinePreset {
  return value !== null && TASK_DEADLINE_PRESETS.some((preset) => preset === value);
}

const VIEW_KEYS: Record<TaskView, `tasks.view.${TaskView}`> = {
  mine: 'tasks.view.mine',
  unassigned: 'tasks.view.unassigned',
  everyone: 'tasks.view.everyone',
};

const PRESET_KEYS: Record<TaskDeadlinePreset, `filter.deadline.${TaskDeadlinePreset}`> = {
  all: 'filter.deadline.all',
  overdue: 'filter.deadline.overdue',
  today: 'filter.deadline.today',
  upcoming: 'filter.deadline.upcoming',
  undated: 'filter.deadline.undated',
  range: 'filter.deadline.range',
};

function useTaskFilters() {
  const [params, setParams] = useSearchParams();
  const requestedView = params.get('view');
  const view: TaskView = isTaskView(requestedView) ? requestedView : 'mine';
  const requestedPreset = params.get('deadline');
  const preset: TaskDeadlinePreset = isPreset(requestedPreset) ? requestedPreset : 'all';
  const deadline: TaskDeadlineFilter =
    preset === 'range'
      ? { preset, from: params.get('from') ?? '', to: params.get('to') ?? '' }
      : { preset };
  const update = (changes: Record<string, string | null>): void => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  };
  return {
    view,
    preset,
    deadline,
    showDone: params.get('done') === '1',
    blockedOnly: params.get('blocked') === '1',
    update,
  };
}

function DeadlineChips({
  t,
  preset,
  blockedOnly,
  from,
  to,
  onPreset,
  onRange,
  onBlocked,
}: {
  readonly t: Translator;
  readonly preset: TaskDeadlinePreset;
  readonly blockedOnly: boolean;
  readonly from: string;
  readonly to: string;
  readonly onPreset: (preset: TaskDeadlinePreset) => void;
  readonly onRange: (from: string, to: string) => void;
  readonly onBlocked: (on: boolean) => void;
}): ReactNode {
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const apply = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onRange(draftFrom, draftTo);
  };
  return (
    <>
      <div aria-label={t('filter.deadline.label')} className="chips" role="group">
        {TASK_DEADLINE_PRESETS.map((value) => (
          <button
            aria-pressed={preset === value}
            className="chip-button"
            key={value}
            onClick={() => onPreset(value)}
            type="button"
          >
            {value === 'range' && <Icon name="today" size={14} />}
            {t(PRESET_KEYS[value])}
          </button>
        ))}
        <button
          aria-pressed={blockedOnly}
          className="chip-button"
          onClick={() => onBlocked(!blockedOnly)}
          type="button"
        >
          <Icon name="blocked" size={14} />
          {t('tasks.blocked_only')}
        </button>
      </div>
      {preset === 'range' && (
        <form className="range-form" onSubmit={apply}>
          <label className="field">
            <span className="field__label">{t('filter.date.from')}</span>
            <input
              className="field__control"
              onChange={(event) => setDraftFrom(event.target.value)}
              type="date"
              value={draftFrom}
            />
          </label>
          <label className="field">
            <span className="field__label">{t('filter.date.to')}</span>
            <input
              className="field__control"
              onChange={(event) => setDraftTo(event.target.value)}
              type="date"
              value={draftTo}
            />
          </label>
          <button className="button" type="submit">
            {t('filter.date.apply')}
          </button>
        </form>
      )}
    </>
  );
}

export function Tasks(): ReactNode {
  const { t, locale, user } = useOdin();
  const query = useHouseholdTasksQuery();
  const home = useHomeQuery();
  const members = useMembersQuery();
  const memberList = members.data ?? [];
  const wiring = useTaskWiring({ members: memberList });
  const filters = useTaskFilters();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const now = new Date();
  const userId = user?.id ?? null;
  const items = query.data?.items ?? [];
  const all = { preset: 'all' } as const;
  const counts: Record<TaskView, number> = {
    mine: filterTasks(items, { view: 'mine', userId, deadline: all }, now).length,
    unassigned: filterTasks(items, { view: 'unassigned', userId, deadline: all }, now).length,
    everyone: filterTasks(items, { view: 'everyone', userId, deadline: all }, now).length,
  };
  const valid = resolveTaskDeadlineFilter(filters.deadline, now).ok;
  const shown = filterTasks(
    items,
    {
      view: filters.view,
      userId,
      deadline: filters.deadline,
      search,
      showDone: filters.showDone,
      blockedOnly: filters.blockedOnly,
    },
    now,
  );
  const canCreate = (home.data?.items ?? []).some((list) => list.kind === 'active');

  const body = ((): ReactNode => {
    const rangeUnset =
      filters.preset === 'range' &&
      (filters.deadline.from ?? '') === '' &&
      (filters.deadline.to ?? '') === '';
    if (rangeUnset) return null;
    if (!valid) {
      return (
        <p className="banner banner--danger" role="alert">
          {t('filter.date.invalid')}
        </p>
      );
    }
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
    if (shown.length === 0) return <p className="empty">{t('tasks.all.empty')}</p>;
    return (
      <TaskTable showList t={t}>
        <TaskGroups
          groups={groupTasksByDeadline(shown, now)}
          renderRow={(task) => (
            <TaskRow
              {...wiring.handlers}
              key={task.id}
              locale={locale}
              members={memberList}
              now={now}
              t={t}
              task={taskRowFromHouseholdTask(task)}
            />
          )}
          t={t}
        />
      </TaskTable>
    );
  })();

  return (
    <>
      <div className="page-header">
        <h1>{t('tasks.title')}</h1>
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

      <div className="toolbar">
        <div aria-label={t('tasks.view.label')} className="segmented" role="group">
          {(Object.keys(VIEW_KEYS) as TaskView[]).map((view) => (
            <button
              aria-pressed={filters.view === view}
              className="segmented__option"
              key={view}
              onClick={() => filters.update({ view, done: null })}
              type="button"
            >
              {t(VIEW_KEYS[view])} <span className="segmented__count">{counts[view]}</span>
            </button>
          ))}
        </div>
        <label className="search">
          <Icon name="search" size={18} />
          <span className="visually-hidden">{t('tasks.search')}</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('tasks.search')}
            type="search"
            value={search}
          />
        </label>
        {filters.view === 'everyone' && (
          <label className="toggle">
            <input
              checked={filters.showDone}
              onChange={(event) => filters.update({ done: event.target.checked ? '1' : null })}
              type="checkbox"
            />
            {t('tasks.show_done')}
          </label>
        )}
      </div>

      <DeadlineChips
        blockedOnly={filters.blockedOnly}
        from={filters.deadline.from ?? ''}
        onBlocked={(on) => filters.update({ blocked: on ? '1' : null })}
        onPreset={(value) =>
          filters.update({
            deadline: value === 'all' ? null : value,
            ...(value === 'range' ? {} : { from: null, to: null }),
          })
        }
        onRange={(from, to) => filters.update({ deadline: 'range', from, to })}
        preset={filters.preset}
        t={t}
        to={filters.deadline.to ?? ''}
      />

      {wiring.errors}
      {body}

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
