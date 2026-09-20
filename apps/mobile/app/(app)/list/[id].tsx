import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import type { TaskDto } from '@odin/contracts';
import { taskRowFromTask } from '@odin/contracts';
import {
  createTask,
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
import { ErrorBanner } from '../../../src/components/Banner.tsx';
import { NavSpacer } from '../../../src/components/BottomNav.tsx';
import { PrimaryButton, SecondaryButton } from '../../../src/components/Button.tsx';
import { ListEditor } from '../../../src/components/ListEditor.tsx';
import { Progress } from '../../../src/components/Progress.tsx';
import { EmptyState, LoadingState, Screen } from '../../../src/components/Screen.tsx';
import { TaskEditor } from '../../../src/components/TaskEditor.tsx';
import { TaskRow } from '../../../src/components/TaskRow.tsx';

/**
 * List detail. Tasks render incomplete-first with their declared order
 * preserved inside each group; totals always come from the server's whole-list
 * counts rather than the loaded page.
 *
 * A template is read-only here: copying is the only way to act on one, which is
 * what keeps templates and active lists independent.
 */

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
        {!isTemplate && (
          <>
            <Progress completed={page.completed_tasks} t={t} total={page.total_tasks} />
            <View style={styles.actions}>
              <SecondaryButton label={t('list.edit')} onPress={() => setEditingList(true)} />
              <PrimaryButton label={t('list.add_task')} onPress={() => setAddingTask(true)} />
            </View>
          </>
        )}

        {completeCommand.state.error !== null && (
          <ErrorBanner
            error={completeCommand.state.error}
            onRetry={
              completeCommand.state.error.code === 'NETWORK'
                ? () => void completeCommand.retry()
                : undefined
            }
            t={t}
          />
        )}

        {ordered.length === 0 ? (
          <EmptyState label={t('list.empty')} />
        ) : (
          ordered.map((task) => (
            <TaskRow
              busy={completeCommand.state.pending}
              key={task.id}
              locale={locale}
              members={members.data ?? []}
              onEdit={isTemplate ? undefined : () => setEditingTask(task)}
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
          ))
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
