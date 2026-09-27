import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import type { TaskDto } from '@odin/contracts';
import {
  deleteList,
  deleteTask,
  keysAffectedByListChange,
  keysAffectedByTaskChange,
  saveListTemplate,
  updateList,
  updateTask,
  useCommand,
  useTaskRowActions,
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
  TemplateSavedNotice,
  type PendingConfirm,
} from '../components/ListDetailParts.tsx';
import { ListEditor } from '../components/ListEditor.tsx';
import { ListTaskEditor } from '../components/ListTaskEditor.tsx';
import { Progress } from '../components/Progress.tsx';
import { TaskDetailsFlow } from '../components/TaskDetailsFlow.tsx';

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
  const [detailsTaskId, setDetailsTaskId] = useState<string | null>(null);
  const [addingTask, setAddingTask] = useState(false);
  const [confirming, setConfirming] = useState<PendingConfirm | null>(null);
  const [templateSaved, setTemplateSaved] = useState(false);

  const invalidateTask = keysAffectedByTaskChange(listId);
  const rowActions = useTaskRowActions(client, listId);

  const saveList = useCommand(
    (
      requestId,
      input: {
        readonly expectedVersion: number;
        readonly title: string;
        readonly subtitle: string | null;
        readonly notes: string | null;
      },
    ) =>
      updateList(client, requestId, {
        listId: listId ?? '',
        expectedVersion: input.expectedVersion,
        title: input.title,
        subtitle: input.subtitle,
        notes: input.notes,
      }),
    {
      invalidate: keysAffectedByListChange(listId),
      onSuccess: () => setEditingList(false),
    },
  );

  // A saved list template is a new list, so only Home's cache changes; this
  // list is untouched and keeps its version.
  const saveTemplate = useCommand(
    (requestId, input: { readonly listId: string }) =>
      saveListTemplate(client, requestId, input.listId),
    {
      invalidate: keysAffectedByListChange(),
      onSuccess: () => setTemplateSaved(true),
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
  if (!list.data) {
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
  const memberList = members.data ?? [];
  const closeTaskEditor = (): void => {
    setEditingTask(null);
    setAddingTask(false);
  };

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
        onSaveTemplate={() => {
          setTemplateSaved(false);
          void saveTemplate.run({ listId: page.list.id });
        }}
        notes={page.list.notes}
        pending={anyPending([removeList.state, saveTemplate.state])}
        subtitle={page.list.subtitle}
        t={t}
        title={page.list.title}
      />

      <TemplateSavedNotice error={saveTemplate.state.error} saved={templateSaved} t={t} />

      {!isTemplate && <Progress completed={page.completed_tasks} t={t} total={page.total_tasks} />}

      <CommandErrors
        errors={[
          ...rowActions.errors,
          { error: removeList.state.error, retry: () => void removeList.retry() },
          { error: removeTask.state.error, retry: () => void removeTask.retry() },
          { error: unassignTask.state.error, retry: () => void unassignTask.retry() },
          { error: saveTemplate.state.error, retry: () => void saveTemplate.retry() },
        ]}
        t={t}
      />

      {ordered.length === 0 ? (
        <p className="empty">{t('list.empty')}</p>
      ) : (
        <ListTasks
          busy={rowActions.busy || anyPending([removeTask.state, unassignTask.state])}
          isTemplate={isTemplate}
          locale={locale}
          members={memberList}
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
          onMoveTask={rowActions.move}
          onOpenDetails={(selected) => setDetailsTaskId(selected.id)}
          onSetState={rowActions.setState}
          onToggleCompleted={rowActions.toggleCompleted}
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

      {detailsTaskId !== null && (
        <TaskDetailsFlow
          canEdit={!isTemplate}
          members={memberList}
          onClose={() => setDetailsTaskId(null)}
          taskId={detailsTaskId}
        />
      )}

      {(addingTask || editingTask !== null) && (
        <ListTaskEditor
          key={editingTask?.id ?? 'new'}
          listId={page.list.id}
          members={memberList}
          onClose={closeTaskEditor}
          onReviewConflict={() => {
            closeTaskEditor();
            void list.refetch();
          }}
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
              notes: input.notes,
            })
          }
          pending={saveList.state.pending}
          t={t}
        />
      )}
    </>
  );
}
