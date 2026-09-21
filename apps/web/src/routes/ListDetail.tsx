import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import type { TaskDto } from '@odin/contracts';
import {
  createTask,
  deleteList,
  deleteTask,
  keysAffectedByListChange,
  keysAffectedByTaskChange,
  setTaskCompleted,
  updateList,
  updateTask,
  useCommand,
} from '@odin/data';
import { sortTasksInList } from '@odin/domain';

import { useOdin } from '../app/OdinContext.ts';
import { useListQuery, useMembersQuery } from '../app/queries.ts';
import { Fab } from '../components/Fab.tsx';
import {
  anyPending,
  CommandErrors,
  DestructiveConfirm,
  ListHeader,
  ListTasks,
  type PendingConfirm,
} from '../components/ListDetailParts.tsx';
import { ListEditor } from '../components/ListEditor.tsx';
import { Progress } from '../components/Progress.tsx';
import { TaskEditor } from '../components/TaskEditor.tsx';

/**
 * List detail. Tasks render incomplete-first with their declared order
 * preserved inside each group; totals always come from the server's whole-list
 * counts rather than the loaded page.
 */

export function ListDetail(): ReactNode {
  const { listId } = useParams<{ listId: string }>();
  const navigate = useNavigate();
  const { t, locale, client } = useOdin();
  const list = useListQuery(listId, true);
  const members = useMembersQuery(true);

  const [editingList, setEditingList] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskDto | null>(null);
  const [addingTask, setAddingTask] = useState(false);
  const [confirming, setConfirming] = useState<PendingConfirm | null>(null);

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
        readonly notes: string | null;
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
            notes: input.notes,
            assigneeId: input.assigneeId,
            dueAt: input.dueAt,
          })
        : updateTask(client, requestId, {
            taskId: input.taskId,
            expectedVersion: input.expectedVersion,
            title: input.title,
            notes: input.notes,
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

  const removeList = useCommand(
    (requestId, input: { readonly listId: string; readonly expectedVersion: number }) =>
      deleteList(client, requestId, input),
    {
      invalidate: keysAffectedByListChange(listId),
      onSuccess: () => void navigate('/'),
    },
  );

  const removeTask = useCommand(
    (requestId, input: { readonly taskId: string; readonly expectedVersion: number }) =>
      deleteTask(client, requestId, input),
    { invalidate: invalidateTask },
  );

  const unassignTask = useCommand(
    (
      requestId,
      input: {
        readonly taskId: string;
        readonly expectedVersion: number;
        readonly title: string;
        readonly dueAt: string | null;
      },
    ) =>
      updateTask(client, requestId, {
        taskId: input.taskId,
        expectedVersion: input.expectedVersion,
        title: input.title,
        assigneeId: null,
        dueAt: input.dueAt,
      }),
    { invalidate: invalidateTask },
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
      <ListHeader
        isTemplate={isTemplate}
        onAddTask={() => setAddingTask(true)}
        onDelete={() =>
          setConfirming({
            titleKey: 'list.delete.title',
            bodyKey: 'list.delete.confirm',
            confirmKey: 'list.delete',
            run: () =>
              void removeList.run({
                listId: page.list.id,
                expectedVersion: page.list.version,
              }),
          })
        }
        onEdit={() => setEditingList(true)}
        pending={removeList.state.pending}
        subtitle={page.list.subtitle}
        t={t}
        title={page.list.title}
      />

      {!isTemplate && <Progress completed={page.completed_tasks} t={t} total={page.total_tasks} />}

      <CommandErrors
        errors={[
          { error: completeCommand.state.error, retry: () => void completeCommand.retry() },
          { error: removeList.state.error, retry: () => void removeList.retry() },
          { error: removeTask.state.error, retry: () => void removeTask.retry() },
          { error: unassignTask.state.error, retry: () => void unassignTask.retry() },
        ]}
        onRetry={() => void completeCommand.retry()}
        t={t}
      />

      {ordered.length === 0 ? (
        <p className="empty">{t('list.empty')}</p>
      ) : (
        <ListTasks
          busy={anyPending([completeCommand.state, removeTask.state, unassignTask.state])}
          isTemplate={isTemplate}
          locale={locale}
          members={members.data ?? []}
          onDelete={(selected) =>
            setConfirming({
              titleKey: 'task.delete.title',
              bodyKey: 'task.delete.confirm',
              confirmKey: 'task.delete.short',
              run: () =>
                void removeTask.run({
                  taskId: selected.id,
                  expectedVersion: selected.version,
                }),
            })
          }
          onEdit={(selected) =>
            setEditingTask(ordered.find((entry) => entry.id === selected.id) ?? null)
          }
          onToggleCompleted={(selected, completed) =>
            void completeCommand.run({
              taskId: selected.id,
              expectedVersion: selected.version,
              completed,
            })
          }
          onUnassign={(selected) =>
            setConfirming({
              titleKey: 'task.unassign.title',
              bodyKey: 'task.unassign.confirm',
              confirmKey: 'task.unassign.short',
              run: () =>
                void unassignTask.run({
                  taskId: selected.id,
                  expectedVersion: selected.version,
                  title: selected.title,
                  dueAt: selected.due_at,
                }),
            })
          }
          t={t}
          tasks={ordered}
        />
      )}

      {!isTemplate && <Fab label={t('list.add_task')} onClick={() => setAddingTask(true)} />}

      <DestructiveConfirm
        confirm={confirming}
        onClose={() => setConfirming(null)}
        pending={anyPending([removeList.state, removeTask.state, unassignTask.state])}
        t={t}
      />

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
