import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';

import {
  keysAffectedByTaskChange,
  setTaskCompleted,
  setTaskStatus,
  updateTask,
  useCommand,
} from '@odin/data';
import {
  taskRowFromCrossList,
  type TaskDto,
  type TaskRowModel,
  type TaskStatus,
} from '@odin/contracts';

import { useOdin } from '../app/OdinContext.ts';
import { useMembersQuery, useMyTasksQuery } from '../app/queries.ts';
import { ErrorBanner } from '../components/Banner.tsx';
import { TaskRow } from '../components/TaskRow.tsx';
import { TaskDetailsDialog } from '../components/TaskDetailsDialog.tsx';
import { TaskEditor } from '../components/TaskEditor.tsx';

/**
 * My Tasks: incomplete tasks assigned to the signed-in member, due ascending
 * with undated last. Completing one removes it from this view after the server
 * confirms, not before.
 */

export function MyTasks(): ReactNode {
  const { t, locale, client, user } = useOdin();
  const query = useMyTasksQuery(true);
  const members = useMembersQuery(true);
  const [detailsTask, setDetailsTask] = useState<TaskRowModel | null>(null);
  const [editingTask, setEditingTask] = useState<TaskDto | null>(null);

  const complete = useCommand(
    (
      requestId,
      input: {
        readonly taskId: string;
        readonly expectedVersion: number;
        readonly completed: boolean;
      },
    ) => setTaskCompleted(client, requestId, input),
    { invalidate: keysAffectedByTaskChange() },
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
    {
      invalidate: keysAffectedByTaskChange(),
      onSuccess: () => setEditingTask(null),
    },
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
    { invalidate: keysAffectedByTaskChange() },
  );

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

  // The server already returns due-ascending with undated last.
  const tasks = query.data.items;

  return (
    <>
      <div className="page-header">
        <h1>{t('my_tasks.title')}</h1>
      </div>

      {complete.state.error !== null && (
        <ErrorBanner error={complete.state.error} onRetry={() => void complete.retry()} t={t} />
      )}
      {status.state.error !== null && <ErrorBanner error={status.state.error} t={t} />}

      {tasks.length === 0 ? (
        <p className="empty">{t('my_tasks.empty')}</p>
      ) : (
        <ul className="task-list">
          {tasks.map((task) => (
            <TaskRow
              busy={complete.state.pending || status.state.pending}
              key={task.task_id}
              locale={locale}
              members={members.data ?? []}
              onToggleCompleted={(selected, completed) =>
                void complete.run({
                  taskId: selected.id,
                  expectedVersion: selected.version,
                  completed,
                })
              }
              onOpenDetails={setDetailsTask}
              onSetStatus={(selected, nextStatus) =>
                void status.run({
                  taskId: selected.id,
                  expectedVersion: selected.version,
                  status: nextStatus,
                })
              }
              t={t}
              task={taskRowFromCrossList(task, user?.id ?? null)}
            />
          ))}
        </ul>
      )}

      {tasks.length > 0 && (
        <p className="card__subtitle">
          <Link to="/">{t('list.back')}</Link>
        </p>
      )}

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
