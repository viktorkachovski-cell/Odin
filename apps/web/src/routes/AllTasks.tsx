import { useState, type FormEvent, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';

import {
  taskRowFromTask,
  type AllTaskDto,
  type MemberDto,
  type TaskDto,
  type TaskRowModel,
  type TaskStatus,
} from '@odin/contracts';
import {
  keysAffectedByTaskChange,
  setTaskCompleted,
  setTaskStatus,
  updateTask,
  useCommand,
} from '@odin/data';
import { resolveTaskDeadlineFilter, type TaskDeadlineFilter } from '@odin/domain';
import type { Locale, Translator } from '@odin/i18n';

import { useOdin } from '../app/OdinContext.ts';
import { useAllTasksQuery, useMembersQuery } from '../app/queries.ts';
import { ErrorBanner } from '../components/Banner.tsx';
import { TaskDetailsDialog } from '../components/TaskDetailsDialog.tsx';
import { TaskEditor } from '../components/TaskEditor.tsx';
import { TaskRow } from '../components/TaskRow.tsx';

const PRESETS = ['all', 'overdue', 'today', 'upcoming', 'undated', 'range'] as const;
type Preset = (typeof PRESETS)[number];

function isPreset(value: string | null): value is Preset {
  return value !== null && PRESETS.some((preset) => preset === value);
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
        <select onChange={(event) => applyPreset(event.target.value as Preset)} value={preset}>
          {PRESETS.map((value) => (
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
  busy,
  onOpenDetails,
  onSetStatus,
  onToggleCompleted,
}: {
  readonly tasks: readonly AllTaskDto[];
  readonly members: readonly MemberDto[];
  readonly locale: Locale;
  readonly t: Translator;
  readonly busy: boolean;
  readonly onOpenDetails: (task: TaskRowModel) => void;
  readonly onSetStatus: (task: TaskRowModel, status: TaskStatus) => void;
  readonly onToggleCompleted: (task: TaskRowModel, completed: boolean) => void;
}): ReactNode {
  return (
    <ul className="task-list">
      {tasks.map((task) => (
        <TaskRow
          busy={busy}
          key={task.id}
          locale={locale}
          members={members}
          onOpenDetails={onOpenDetails}
          onSetStatus={onSetStatus}
          onToggleCompleted={onToggleCompleted}
          t={t}
          task={{ ...taskRowFromTask(task), list_title: task.list_title }}
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
  busy,
  retry,
  onOpenDetails,
  onSetStatus,
  onToggleCompleted,
}: {
  readonly valid: boolean;
  readonly pending: boolean;
  readonly failed: boolean;
  readonly tasks: readonly AllTaskDto[];
  readonly members: readonly MemberDto[];
  readonly locale: Locale;
  readonly t: Translator;
  readonly busy: boolean;
  readonly retry: () => void;
  readonly onOpenDetails: (task: TaskRowModel) => void;
  readonly onSetStatus: (task: TaskRowModel, status: TaskStatus) => void;
  readonly onToggleCompleted: (task: TaskRowModel, completed: boolean) => void;
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
      busy={busy}
      locale={locale}
      members={members}
      onOpenDetails={onOpenDetails}
      onSetStatus={onSetStatus}
      onToggleCompleted={onToggleCompleted}
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
  const [detailsTask, setDetailsTask] = useState<TaskRowModel | null>(null);
  const [editingTask, setEditingTask] = useState<TaskDto | null>(null);

  const invalidate = keysAffectedByTaskChange();
  const complete = useCommand(
    (
      requestId,
      input: {
        readonly taskId: string;
        readonly expectedVersion: number;
        readonly completed: boolean;
      },
    ) => setTaskCompleted(client, requestId, input),
    { invalidate },
  );
  const status = useCommand(
    (
      requestId,
      input: {
        readonly taskId: string;
        readonly expectedVersion: number;
        readonly status: TaskStatus;
      },
    ) => setTaskStatus(client, requestId, input),
    { invalidate },
  );
  const saveTask = useCommand(
    (
      requestId,
      input: {
        readonly taskId: string;
        readonly expectedVersion: number;
        readonly title: string;
        readonly notes: string;
        readonly assigneeId: string | null;
        readonly dueAt: string | null;
      },
    ) => updateTask(client, requestId, input),
    { invalidate, onSuccess: () => setEditingTask(null) },
  );

  const tasks = query.data?.items ?? [];
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
      {complete.state.error !== null && (
        <ErrorBanner error={complete.state.error} onRetry={() => void complete.retry()} t={t} />
      )}
      {status.state.error !== null && (
        <ErrorBanner error={status.state.error} onRetry={() => void status.retry()} t={t} />
      )}
      <TaskResults
        busy={complete.state.pending || status.state.pending}
        failed={query.isError}
        locale={locale}
        members={members.data ?? []}
        onOpenDetails={setDetailsTask}
        onSetStatus={(selected, nextStatus) =>
          void status.run({
            taskId: selected.id,
            expectedVersion: selected.version,
            status: nextStatus,
          })
        }
        onToggleCompleted={(selected, completed) =>
          void complete.run({ taskId: selected.id, expectedVersion: selected.version, completed })
        }
        pending={query.isPending}
        retry={() => void query.refetch()}
        t={t}
        tasks={tasks}
        valid={resolution.ok}
      />
      {detailsTask !== null && (
        <TaskDetailsDialog
          canEdit
          locale={locale}
          members={members.data ?? []}
          onClose={() => setDetailsTask(null)}
          onEdit={(task) => {
            setDetailsTask(null);
            setEditingTask(task);
          }}
          t={t}
          taskId={detailsTask.id}
        />
      )}
      {editingTask !== null && (
        <TaskEditor
          conflict={saveTask.state.error?.code === 'CONFLICT'}
          error={saveTask.state.error}
          key={editingTask.id}
          members={members.data ?? []}
          onCancel={() => {
            saveTask.reset();
            setEditingTask(null);
          }}
          onReviewConflict={() => {
            saveTask.reset();
            setEditingTask(null);
          }}
          onSubmit={(input) =>
            void saveTask.run({
              taskId: editingTask.id,
              expectedVersion: editingTask.version,
              title: input.title,
              notes: input.notes,
              assigneeId: input.assigneeId,
              dueAt: input.dueAt,
            })
          }
          pending={saveTask.state.pending}
          t={t}
          task={editingTask}
        />
      )}
    </>
  );
}
