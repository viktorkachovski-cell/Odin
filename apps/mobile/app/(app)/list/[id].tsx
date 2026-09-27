import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';

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

import { useNavVisibility } from '../../../src/state/NavVisibility.tsx';
import { useOdin } from '../../../src/state/OdinContext.ts';
import { useListQuery, useMembersQuery } from '../../../src/state/queries.ts';
import { NavSpacer } from '../../../src/components/BottomNav.tsx';
import { SecondaryButton } from '../../../src/components/Button.tsx';
import { FloatingActionButton } from '../../../src/components/FloatingActionButton.tsx';
import { ListEditor } from '../../../src/components/ListEditor.tsx';
import { ListTaskEditor } from '../../../src/components/ListTaskEditor.tsx';
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
import { TaskDetailsFlow } from '../../../src/components/TaskDetailsFlow.tsx';

export default function ListDetailScreen(): ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale, client } = useOdin();
  const nav = useNavVisibility();
  const list = useListQuery(id, true);
  const members = useMembersQuery(true);

  const [editingList, setEditingList] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskDto | null>(null);
  const [detailsTaskId, setDetailsTaskId] = useState<string | null>(null);
  const [addingTask, setAddingTask] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);

  const invalidateTask = keysAffectedByTaskChange(id);
  const rowActions = useTaskRowActions(client, id);

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
  const memberList = members.data ?? [];
  const closeTaskEditor = (): void => {
    setEditingTask(null);
    setAddingTask(false);
  };

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
            ...rowActions.errors,
            { error: removeList.state.error, retry: () => void removeList.retry() },
            { error: removeTask.state.error, retry: () => void removeTask.retry() },
            { error: unassignTask.state.error, retry: () => void unassignTask.retry() },
            { error: saveTemplate.state.error, retry: () => void saveTemplate.retry() },
          ]}
          t={t}
        />

        {ordered.length === 0 ? (
          <EmptyState label={t('list.empty')} />
        ) : (
          <ListTasks
            busy={rowActions.busy || anyPending([removeTask.state, unassignTask.state])}
            isTemplate={isTemplate}
            locale={locale}
            members={memberList}
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
            onMove={rowActions.move}
            onOpen={(selected) => setDetailsTaskId(selected.id)}
            onSetState={rowActions.setState}
            onToggleCompleted={rowActions.toggleCompleted}
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

      {!isTemplate && (
        <FloatingActionButton label={t('list.add_task')} onPress={() => setAddingTask(true)} />
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

      <TaskDetailsFlow
        editable={!isTemplate}
        key={detailsTaskId ?? 'closed'}
        members={memberList}
        onClose={() => setDetailsTaskId(null)}
        taskId={detailsTaskId}
      />

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

const styles = StyleSheet.create({
  content: { gap: 12, paddingBottom: 16 },
});
