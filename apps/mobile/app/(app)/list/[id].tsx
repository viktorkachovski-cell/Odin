import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';

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

import { useNavVisibility } from '../../../src/state/NavVisibility.tsx';
import { useOdin } from '../../../src/state/OdinContext.ts';
import { useListQuery, useMembersQuery } from '../../../src/state/queries.ts';
import { NavSpacer } from '../../../src/components/BottomNav.tsx';
import { SecondaryButton } from '../../../src/components/Button.tsx';
import { ListEditor } from '../../../src/components/ListEditor.tsx';
import {
  CommandErrors,
  ListHeader as ActionHeader,
  ListProgress,
  ListTasks,
} from '../../../src/components/ListDetailSections.tsx';
import { EmptyState, LoadingState, Screen } from '../../../src/components/Screen.tsx';
import { TaskEditor } from '../../../src/components/TaskEditor.tsx';

export default function ListDetailScreen(): ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale, client } = useOdin();
  const nav = useNavVisibility();
  const list = useListQuery(id, true);
  const members = useMembersQuery(true);

  const [editingList, setEditingList] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskDto | null>(null);
  const [addingTask, setAddingTask] = useState(false);

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
        listId: id ?? '',
        expectedVersion: input.expectedVersion,
        title: input.title,
        subtitle: input.subtitle,
      }),
    { invalidate: keysAffectedByListChange(id), onSuccess: () => setEditingList(false) },
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

  if (list.isPending) return <LoadingState label={t('state.loading')} />;
  if (list.isError || list.data === undefined) {
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
    <Screen title={page.list.title}>
      <ScrollView
        contentContainerStyle={styles.content}
        onScroll={nav.onScroll}
        scrollEventThrottle={16}
      >
        <ListProgress
          completed={page.completed_tasks}
          isTemplate={isTemplate}
          t={t}
          total={page.total_tasks}
        />
        <ActionHeader
          isTemplate={isTemplate}
          onAddTask={() => setAddingTask(true)}
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
          pending={removeList.state.pending}
          t={t}
        />

        <CommandErrors
          errors={[
            { error: completeCommand.state.error, retry: () => void completeCommand.retry() },
            { error: removeList.state.error, retry: () => void removeList.retry() },
            { error: removeTask.state.error, retry: () => void removeTask.retry() },
            { error: unassignTask.state.error, retry: () => void unassignTask.retry() },
          ]}
          t={t}
        />

        {ordered.length === 0 ? (
          <EmptyState label={t('list.empty')} />
        ) : (
          <ListTasks
            busy={
              completeCommand.state.pending ||
              removeTask.state.pending ||
              unassignTask.state.pending
            }
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 12 },
  content: { gap: 12, paddingBottom: 16 },
});
