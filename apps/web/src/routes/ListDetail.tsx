import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';

import type { TaskDto } from '@odin/contracts';
import { taskRowFromTask } from '@odin/contracts';
import {
  createTask,
  keysAffectedByListChange,
  keysAffectedByTaskChange,
  setTaskCompleted,
  updateList,
  updateTask,
} from '@odin/data';
import { sortTasksInList } from '@odin/domain';

import { useOdin } from '../app/OdinContext.ts';
import { useListQuery, useMembersQuery } from '../app/queries.ts';
import { useCommand } from '../app/useCommand.ts';
import { ErrorBanner } from '../components/Banner.tsx';
import { ListEditor } from '../components/ListEditor.tsx';
import { Progress } from '../components/Progress.tsx';
import { TaskEditor } from '../components/TaskEditor.tsx';
import { TaskRow } from '../components/TaskRow.tsx';

/**
 * List detail. Tasks render incomplete-first with their declared order
 * preserved inside each group; totals always come from the server's whole-list
 * counts rather than the loaded page.
 */

export function ListDetail(): ReactNode {
  const { listId } = useParams<{ listId: string }>();
  const { t, locale, client } = useOdin();
  const list = useListQuery(listId, true);
  const members = useMembersQuery(true);

  const [editingList, setEditingList] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskDto | null>(null);
  const [addingTask, setAddingTask] = useState(false);

  const invalidateTask = keysAffectedByTaskChange(listId);

  const completeCommand = useCommand(
    (
      requestId,
      input: {
        readonly taskId: string;
        readonly expectedVersion: number;
        readonly completed: boolean;
      },
    ) => setTaskCompleted(client, requestId, input),
    { invalidate: invalidateTask },
  );

  const saveTask = useCommand(
    (
      requestId,
      input: {
        readonly taskId: string | null;
        readonly expectedVersion: number;
        readonly title: string;
        readonly assigneeId: string | null;
        readonly dueAt: string | null;
      },
    ) =>
      input.taskId === null
        ? createTask(client, requestId, {
            listId: listId ?? '',
            title: input.title,
            assigneeId: input.assigneeId,
            dueAt: input.dueAt,
          })
        : updateTask(client, requestId, {
            taskId: input.taskId,
            expectedVersion: input.expectedVersion,
            title: input.title,
            assigneeId: input.assigneeId,
            dueAt: input.dueAt,
          }),
    {
      invalidate: invalidateTask,
      onSuccess: () => {
        setEditingTask(null);
        setAddingTask(false);
      },
    },
  );

  const saveList = useCommand(
    (
      requestId,
      input: {
        readonly expectedVersion: number;
        readonly title: string;
        readonly subtitle: string | null;
      },
    ) =>
      updateList(client, requestId, {
        listId: listId ?? '',
        expectedVersion: input.expectedVersion,
        title: input.title,
        subtitle: input.subtitle,
      }),
    {
      invalidate: keysAffectedByListChange(listId),
      onSuccess: () => setEditingList(false),
    },
  );

  if (list.isPending) return <p role="status">{t('state.loading')}</p>;
  if (list.isError) {
    return (
      <>
        <p className="empty">{t('list.not_found')}</p>
        <Link className="button" to="/">
          {t('list.back')}
        </Link>
      </>
    );
  }

  const page = list.data;
  const ordered = sortTasksInList(page.tasks);
  const isTemplate = page.list.kind === 'template';
  const taskConflict = saveTask.state.error?.code === 'CONFLICT';

  return (
    <>
      <div className="page-header">
        <div>
          <Link to="/">{t('list.back')}</Link>
          <h1>{page.list.title}</h1>
          {page.list.subtitle !== null && <p className="card__subtitle">{page.list.subtitle}</p>}
        </div>
        {!isTemplate && (
          <div className="task-row__actions">
            <button className="button" onClick={() => setEditingList(true)} type="button">
              {t('list.edit')}
            </button>
            <button
              className="button button--primary"
              onClick={() => setAddingTask(true)}
              type="button"
            >
              {t('list.add_task')}
            </button>
          </div>
        )}
      </div>

      {!isTemplate && <Progress completed={page.completed_tasks} t={t} total={page.total_tasks} />}

      {completeCommand.state.error !== null && (
        <ErrorBanner
          error={completeCommand.state.error}
          onRetry={() => void completeCommand.retry()}
          t={t}
        />
      )}

      {ordered.length === 0 ? (
        <p className="empty">{t('list.empty')}</p>
      ) : (
        <ul className="task-list">
          {ordered.map((task) => (
            <TaskRow
              busy={completeCommand.state.pending}
              key={task.id}
              locale={locale}
              members={members.data ?? []}
              onEdit={
                isTemplate
                  ? undefined
                  : (selected) =>
                      setEditingTask(ordered.find((entry) => entry.id === selected.id) ?? null)
              }
              onToggleCompleted={
                isTemplate
                  ? undefined
                  : (selected, completed) =>
                      void completeCommand.run({
                        taskId: selected.id,
                        expectedVersion: selected.version,
                        completed,
                      })
              }
              t={t}
              task={taskRowFromTask(task)}
            />
          ))}
        </ul>
      )}

      {(addingTask || editingTask !== null) && (
        <TaskEditor
          conflict={taskConflict}
          error={saveTask.state.error}
          key={editingTask?.id ?? 'new'}
          members={members.data ?? []}
          onCancel={() => {
            saveTask.reset();
            setEditingTask(null);
            setAddingTask(false);
          }}
          onReviewConflict={() => {
            saveTask.reset();
            setEditingTask(null);
            setAddingTask(false);
            void list.refetch();
          }}
          onSubmit={(input) =>
            void saveTask.run({
              taskId: editingTask?.id ?? null,
              expectedVersion: editingTask?.version ?? 0,
              title: input.title,
              assigneeId: input.assigneeId,
              dueAt: input.dueAt,
            })
          }
          pending={saveTask.state.pending}
          t={t}
          task={editingTask}
        />
      )}

      {editingList && (
        <ListEditor
          error={saveList.state.error}
          list={page.list}
          onCancel={() => {
            saveList.reset();
            setEditingList(false);
          }}
          onSubmit={(input) =>
            void saveList.run({
              expectedVersion: page.list.version,
              title: input.title,
              subtitle: input.subtitle,
            })
          }
          pending={saveList.state.pending}
          t={t}
        />
      )}
    </>
  );
}
