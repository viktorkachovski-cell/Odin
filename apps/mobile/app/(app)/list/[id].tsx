import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, ScrollView } from 'react-native';

import type { TaskDto, TaskStatus } from '@odin/contracts';
import {
  createTask,
  deleteList,
  deleteTask,
  keysAffectedByListChange,
  keysAffectedByTaskChange,
  moveTask,
  saveListTemplate,
  setTaskCompleted,
  setTaskStatus,
  updateList,
  updateTask,
  useCommand,
} from '@odin/data';
import { sortTasksInList } from '@odin/domain';

import { useNavVisibility } from '../../../src/state/NavVisibility.tsx';
import { useOdin } from '../../../src/state/OdinContext.ts';
import { useListQuery, useMembersQuery } from '../../../src/state/queries.ts';
import { NavSpacer } from '../../../src/components/BottomNav.tsx';
import { SecondaryButton } from '../../../src/components/Button.tsx';
import { ActiveListAddTaskFab } from '../../../src/components/FloatingActionButton.tsx';
import { ListEditor } from '../../../src/components/ListEditor.tsx';
import {
  anyPending,
  CommandErrors,
  ListHeader as ActionHeader,
  ListMeta,
  ListProgress,
  ListTasks,
  TemplateSavedNotice,
} from '../../../src/components/ListDetailSections.tsx';
import { EmptyState, LoadingState, Screen } from '../../../src/components/Screen.tsx';
import { TaskEditor } from '../../../src/components/TaskEditor.tsx';
import { TaskDetailsSheet } from '../../../src/components/TaskDetailsSheet.tsx';

export default function ListDetailScreen(): ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale, client } = useOdin();
  const nav = useNavVisibility();
  const list = useListQuery(id, true);
  const members = useMembersQuery(true);

  const [editingList, setEditingList] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskDto | null>(null);
  const [viewingTask, setViewingTask] = useState<TaskDto | null>(null);
  const [addingTask, setAddingTask] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);

  const invalidateTask = keysAffectedByTaskChange(id);

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
            listId: id ?? '',
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
        readonly notes: string | null;
      },
    ) =>
      updateList(client, requestId, {
        listId: id ?? '',
        expectedVersion: input.expectedVersion,
        title: input.title,
        subtitle: input.subtitle,
        notes: input.notes,
      }),
    { invalidate: keysAffectedByListChange(id), onSuccess: () => setEditingList(false) },
  );

  // A saved list template is a new list, so only Home's cache changes; this
  // list is untouched and keeps its version.
  const saveTemplate = useCommand(
    (requestId, input: { readonly listId: string }) =>
      saveListTemplate(client, requestId, input.listId),
    { invalidate: keysAffectedByListChange(), onSuccess: () => setTemplateSaved(true) },
  );

  const removeList = useCommand(
    (requestId, input: { readonly listId: string; readonly expectedVersion: number }) =>
      deleteList(client, requestId, input),
    {
      invalidate: keysAffectedByListChange(id),
      onSuccess: () => router.replace('/'),
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

  const changeStatus = useCommand(
    (
      requestId,
      input: {
        readonly taskId: string;
        readonly expectedVersion: number;
        readonly status: TaskStatus;
      },
    ) => setTaskStatus(client, requestId, input),
    { invalidate: invalidateTask },
  );

  const reorderTask = useCommand(
    (
      requestId,
      input: {
        readonly taskId: string;
        readonly expectedVersion: number;
        readonly direction: 'up' | 'down';
      },
    ) => moveTask(client, requestId, input),
    { invalidate: invalidateTask },
  );

  if (list.isPending) return <LoadingState label={t('state.loading')} />;
  if (list.data === undefined) {
    return (
      <Screen title={t('list.not_found')}>
        <SecondaryButton label={t('list.back')} onPress={() => router.back()} />
      </Screen>
    );
  }

  const page = list.data;
  const ordered = sortTasksInList(page.tasks);
  const isTemplate = page.list.kind === 'template';
  const taskConflict = saveTask.state.error?.code === 'CONFLICT';

  return (
    <Screen
      backLabel={t('list.back')}
      headerActionLabel={
        isTemplate ? undefined : t('list.template.save_named', { title: page.list.title })
      }
      onBack={() => router.back()}
      onHeaderAction={() => {
        setTemplateSaved(false);
        void saveTemplate.run({ listId: page.list.id });
      }}
      title={page.list.title}
    >
      <ScrollView
        contentContainerStyle={{ gap: 12, paddingBottom: 16 }}
        onScroll={nav.onScroll}
        scrollEventThrottle={16}
      >
        <ListProgress
          completed={page.completed_tasks}
          isTemplate={isTemplate}
          t={t}
          total={page.total_tasks}
        />
        <ListMeta notes={page.list.notes} subtitle={page.list.subtitle} />
        <ActionHeader
          isTemplate={isTemplate}
          onDelete={() =>
            Alert.alert(t('list.delete'), t('list.delete.confirm'), [
              { text: t('list.back'), style: 'cancel' },
              {
                text: t('list.delete'),
                style: 'destructive',
                onPress: () =>
                  void removeList.run({
                    listId: page.list.id,
                    expectedVersion: page.list.version,
                  }),
              },
            ])
          }
          onEdit={() => setEditingList(true)}
          pending={anyPending([removeList.state, saveTemplate.state])}
          t={t}
        />

        <TemplateSavedNotice error={saveTemplate.state.error} saved={templateSaved} t={t} />

        <CommandErrors
          errors={[
            { error: completeCommand.state.error, retry: () => void completeCommand.retry() },
            { error: removeList.state.error, retry: () => void removeList.retry() },
            { error: removeTask.state.error, retry: () => void removeTask.retry() },
            { error: unassignTask.state.error, retry: () => void unassignTask.retry() },
            { error: changeStatus.state.error, retry: () => void changeStatus.retry() },
            { error: reorderTask.state.error, retry: () => void reorderTask.retry() },
            { error: saveTemplate.state.error, retry: () => void saveTemplate.retry() },
          ]}
          t={t}
        />

        {ordered.length === 0 ? (
          <EmptyState label={t('list.empty')} />
        ) : (
          <ListTasks
            busy={anyPending([
              completeCommand.state,
              removeTask.state,
              unassignTask.state,
              changeStatus.state,
              reorderTask.state,
            ])}
            isTemplate={isTemplate}
            locale={locale}
            members={members.data ?? []}
            onDelete={(selected) =>
              Alert.alert(t('task.delete', { title: selected.title }), t('task.delete.confirm'), [
                { text: t('list.back'), style: 'cancel' },
                {
                  text: t('task.delete.short'),
                  style: 'destructive',
                  onPress: () =>
                    void removeTask.run({
                      taskId: selected.id,
                      expectedVersion: selected.version,
                    }),
                },
              ])
            }
            onEdit={(selected) =>
              setEditingTask(ordered.find((task) => task.id === selected.id) ?? null)
            }
            onOpen={(selected) =>
              setViewingTask(ordered.find((task) => task.id === selected.id) ?? null)
            }
            onSetStatus={(selected, status) =>
              void changeStatus.run({
                taskId: selected.id,
                expectedVersion: selected.version,
                status,
              })
            }
            onMove={(selected, direction) =>
              void reorderTask.run({
                taskId: selected.id,
                expectedVersion: selected.version,
                direction,
              })
            }
            onToggleCompleted={(selected, completed) =>
              void completeCommand.run({
                taskId: selected.id,
                expectedVersion: selected.version,
                completed,
              })
            }
            onUnassign={(selected) =>
              Alert.alert(
                t('task.unassign', { title: selected.title }),
                t('task.unassign.confirm'),
                [
                  { text: t('list.back'), style: 'cancel' },
                  {
                    text: t('task.unassign.short'),
                    onPress: () =>
                      void unassignTask.run({
                        taskId: selected.id,
                        expectedVersion: selected.version,
                        title: selected.title,
                        dueAt: selected.due_at,
                      }),
                  },
                ],
              )
            }
            t={t}
            tasks={ordered}
          />
        )}

        <NavSpacer />
      </ScrollView>

      <ActiveListAddTaskFab
        isTemplate={isTemplate}
        label={t('list.add_task')}
        onPress={() => setAddingTask(true)}
      />

      {(addingTask || editingTask !== null) && (
        <TaskEditor
          conflict={taskConflict}
          error={saveTask.state.error}
          key={editingTask?.id ?? 'new'}
          locale={locale}
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

      {viewingTask !== null && (
        <TaskDetailsSheet
          editable={!isTemplate}
          locale={locale}
          members={members.data ?? []}
          onClose={() => setViewingTask(null)}
          onEdit={() => {
            setEditingTask(viewingTask);
            setViewingTask(null);
          }}
          t={t}
          task={viewingTask}
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
    </Screen>
  );
}
