import { useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';

import {
  taskRowFromHouseholdTask,
  type HouseholdTaskDto,
  type MemberDto,
  type TaskRowModel,
} from '@odin/contracts';
import { useTaskRowActions, type TaskRowActions } from '@odin/data';
import {
  resolveTaskDeadlineFilter,
  TASK_DEADLINE_PRESETS,
  type TaskDeadlineFilter,
  type TaskDeadlinePreset,
} from '@odin/domain';
import type { Locale, Translator } from '@odin/i18n';

import { useOdin } from '../app/OdinContext.ts';
import { useAllTasksQuery, useMembersQuery } from '../app/queries.ts';
import { ErrorBanner } from '../components/Banner.tsx';
import { CommandErrors } from '../components/ListDetailParts.tsx';
import { TaskDetailsFlow } from '../components/TaskDetailsFlow.tsx';
import { TaskRow } from '../components/TaskRow.tsx';

type Preset = TaskDeadlinePreset;

function isPreset(value: string | null): value is Preset {
  return value !== null && TASK_DEADLINE_PRESETS.some((preset) => preset === value);
}

function filterLabel(preset: Preset): `filter.deadline.${Preset}` {
  return `filter.deadline.${preset}`;
}

function DeadlineControls({
  preset,
  from,
  to,
  setFrom,
  setTo,
  applyPreset,
  applyRange,
  t,
}: {
  readonly preset: Preset;
  readonly from: string;
  readonly to: string;
  readonly setFrom: (value: string) => void;
  readonly setTo: (value: string) => void;
  readonly applyPreset: (next: Preset) => void;
  readonly applyRange: (event: FormEvent<HTMLFormElement>) => void;
  readonly t: Translator;
}): ReactNode {
  return (
    <>
      <label className="field">
        <span className="field__label">{t('filter.deadline.label')}</span>
        <select
          onChange={(event) => {
            const next = event.target.value;
            if (isPreset(next)) applyPreset(next);
          }}
          value={preset}
        >
          {TASK_DEADLINE_PRESETS.map((value) => (
            <option key={value} value={value}>
              {t(filterLabel(value))}
            </option>
          ))}
        </select>
      </label>
      {preset === 'range' && (
        <form className="field__row" onSubmit={applyRange}>
          <label className="field">
            <span className="field__label">{t('filter.date.from')}</span>
            <input onChange={(event) => setFrom(event.target.value)} type="date" value={from} />
          </label>
          <label className="field">
            <span className="field__label">{t('filter.date.to')}</span>
            <input onChange={(event) => setTo(event.target.value)} type="date" value={to} />
          </label>
          <button className="button" type="submit">
            {t('filter.date.apply')}
          </button>
        </form>
      )}
    </>
  );
}

function AllTaskRows({
  tasks,
  members,
  locale,
  t,
  actions,
  onOpenDetails,
}: {
  readonly tasks: readonly HouseholdTaskDto[];
  readonly members: readonly MemberDto[];
  readonly locale: Locale;
  readonly t: Translator;
  readonly actions: TaskRowActions;
  readonly onOpenDetails: (task: TaskRowModel) => void;
}): ReactNode {
  return (
    <ul className="task-list">
      {tasks.map((task) => (
        <TaskRow
          busy={actions.busy}
          key={task.id}
          locale={locale}
          members={members}
          onOpenDetails={onOpenDetails}
          onSetState={actions.setState}
          onToggleCompleted={actions.toggleCompleted}
          t={t}
          task={taskRowFromHouseholdTask(task)}
        />
      ))}
    </ul>
  );
}

function useDeadlineSelection() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedPreset = searchParams.get('deadline');
  const preset: Preset = isPreset(requestedPreset) ? requestedPreset : 'all';
  const [from, setFrom] = useState(searchParams.get('from') ?? '');
  const [to, setTo] = useState(searchParams.get('to') ?? '');
  const filter: TaskDeadlineFilter =
    preset === 'range'
      ? { preset, from: searchParams.get('from') ?? '', to: searchParams.get('to') ?? '' }
      : { preset };
  const applyPreset = (next: Preset): void => {
    const params = new URLSearchParams();
    params.set('deadline', next);
    if (next === 'range') {
      if (from) params.set('from', from);
      if (to) params.set('to', to);
    }
    setSearchParams(params);
  };
  const applyRange = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setSearchParams(new URLSearchParams({ deadline: 'range', from, to }));
  };
  return { preset, from, to, setFrom, setTo, filter, applyPreset, applyRange };
}

function TaskResults({
  valid,
  pending,
  failed,
  tasks,
  members,
  locale,
  t,
  actions,
  retry,
  onOpenDetails,
}: {
  readonly valid: boolean;
  readonly pending: boolean;
  readonly failed: boolean;
  readonly tasks: readonly HouseholdTaskDto[];
  readonly members: readonly MemberDto[];
  readonly locale: Locale;
  readonly t: Translator;
  readonly actions: TaskRowActions;
  readonly retry: () => void;
  readonly onOpenDetails: (task: TaskRowModel) => void;
}): ReactNode {
  if (!valid)
    return (
      <p className="banner banner--danger" role="alert">
        {t('filter.date.invalid')}
      </p>
    );
  if (pending) return <p role="status">{t('state.loading')}</p>;
  if (failed)
    return (
      <ErrorBanner
        error={{ code: 'UNKNOWN', message_key: 'error.unknown' }}
        onRetry={retry}
        t={t}
      />
    );
  if (tasks.length === 0) return <p className="empty">{t('tasks.all.empty')}</p>;
  return (
    <AllTaskRows
      actions={actions}
      locale={locale}
      members={members}
      onOpenDetails={onOpenDetails}
      t={t}
      tasks={tasks}
    />
  );
}

export function AllTasks(): ReactNode {
  const { t, locale, client } = useOdin();
  const { preset, from, to, setFrom, setTo, filter, applyPreset, applyRange } =
    useDeadlineSelection();
  const resolution = resolveTaskDeadlineFilter(filter);
  const query = useAllTasksQuery(filter, resolution.ok);
  const members = useMembersQuery(true);
  const actions = useTaskRowActions(client);
  const [detailsTaskId, setDetailsTaskId] = useState<string | null>(null);

  return (
    <>
      <div className="page-header">
        <h1>{t('tasks.all.title')}</h1>
      </div>
      <DeadlineControls
        applyPreset={applyPreset}
        applyRange={applyRange}
        from={from}
        preset={preset}
        setFrom={setFrom}
        setTo={setTo}
        t={t}
        to={to}
      />
      <CommandErrors errors={actions.errors} t={t} />
      <TaskResults
        actions={actions}
        failed={query.isError}
        locale={locale}
        members={members.data ?? []}
        onOpenDetails={(selected) => setDetailsTaskId(selected.id)}
        pending={query.isPending}
        retry={() => void query.refetch()}
        t={t}
        tasks={query.data?.items ?? []}
        valid={resolution.ok}
      />
      {detailsTaskId !== null && (
        <TaskDetailsFlow
          canEdit
          members={members.data ?? []}
          onClose={() => setDetailsTaskId(null)}
          taskId={detailsTaskId}
        />
      )}
    </>
  );
}
