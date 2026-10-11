import { useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';

import { taskRowFromHouseholdTask } from '@odin/contracts';
import {
  filterTasks,
  groupTasksByDeadline,
  isTaskDeadlinePreset,
  isTaskView,
  resolveTaskDeadlineFilter,
  summarizeTasks,
  TASK_DEADLINE_PRESETS,
  TASK_VIEWS,
  type TaskDeadlineFilter,
  type TaskDeadlinePreset,
} from '@odin/domain';
import type { Translator } from '@odin/i18n';

import { useOdin } from '../app/OdinContext.ts';
import { useHomeQuery, useHouseholdTasksQuery, useMembersQuery } from '../app/queries.ts';
import { LoadFailure } from '../components/Banner.tsx';
import { Segmented } from '../components/Controls.tsx';
import { Icon } from '../components/Icon.tsx';
import { NewTaskAction } from '../components/NewTaskEditor.tsx';
import { TaskRow } from '../components/TaskRow.tsx';
import { TaskGroups, TaskTable } from '../components/TaskTable.tsx';
import { useTaskWiring } from '../components/useTaskWiring.tsx';

/**
 * Tasks: whose tasks, deadline, search and done are filters over the one
 * household read, held in the URL so a filtered view can be linked to and
 * survives a reload.
 */

function useTaskFilters() {
  const [params, setParams] = useSearchParams();
  const requestedView = params.get('view');
  const view = isTaskView(requestedView) ? requestedView : 'mine';
  const requestedPreset = params.get('deadline');
  const preset = isTaskDeadlinePreset(requestedPreset) ? requestedPreset : 'all';
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
            {t(`filter.deadline.${value}`)}
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

  const now = new Date();
  const userId = user?.id ?? null;
  const items = query.data?.items ?? [];
  const counts = summarizeTasks(items, userId, now);
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
    if (query.isError) return <LoadFailure onRetry={() => void query.refetch()} t={t} />;
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
        <NewTaskAction lists={home.data?.items ?? []} members={memberList} />
      </div>

      <div className="toolbar">
        <Segmented
          label={t('tasks.view.label')}
          onChange={(view) => filters.update({ view, done: null })}
          options={TASK_VIEWS.map((key) => ({
            key,
            label: t(`tasks.view.${key}`),
            count: counts[key],
          }))}
          value={filters.view}
        />
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

      {wiring.overlays}
    </>
  );
}
