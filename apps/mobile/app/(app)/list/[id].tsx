import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ReactNode } from 'react';
import { Alert, FlatList, StyleSheet } from 'react-native';

import type { TaskDto } from '@odin/contracts';
import {
  createTask,
  deleteList,
  deleteTask,
  keysAffectedByListChange,
  keysAffectedByTaskChange,
  saveListTemplate,
  updateTask,
  useCommand,
} from '@odin/data';
import { sortTasksInList } from '@odin/domain';

import { useNavVisibility } from '../../../src/state/NavVisibility.tsx';
import { useOdin } from '../../../src/state/OdinContext.ts';
import { useListQuery, useMembersQuery } from '../../../src/state/queries.ts';
import { useListEditorCommand } from '../../../src/state/useListEditorCommand.ts';
import { useTaskRowCommands } from '../../../src/state/useTaskRowCommands.ts';
import { NavSpacer } from '../../../src/components/BottomNav.tsx';
import { ErrorBanner } from '../../../src/components/Banner.tsx';
import { SecondaryButton } from '../../../src/components/Button.tsx';
import { FloatingActionButton } from '../../../src/components/FloatingActionButton.tsx';
import { ListEditor } from '../../../src/components/ListEditor.tsx';
import { LoadMore } from '../../../src/components/LoadMore.tsx';
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
import { TaskEditor, type TaskDraft } from '../../../src/components/TaskEditor.tsx';

function AddTaskFab({
  isTemplate,
  label,
  onPress,
}: {
  readonly isTemplate: boolean;
  readonly label: string;
  readonly onPress: () => void;
}): ReactNode {
  return isTemplate ? null : <FloatingActionButton label={label} onPress={onPress} />;
}

export default function ListDetailScreen(): ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale, client } = useOdin();
  const nav = useNavVisibility();
  const list = useListQuery(id, true);
  const members = useMembersQuery(true);

  const listEditor = useListEditorCommand(client, id);
  const [editingTask, setEditingTask] = useState<TaskDto | null>(null);
  const [addingTask, setAddingTask] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [reviewedTask, setReviewedTask] = useState<TaskDto | null>(null);
  const [reviewingConflict, setReviewingConflict] = useState(false);
  const [reviewError, setReviewError] = useState(false);
  const latestDraft = useRef<TaskDraft | null>(null);
  const submittedDraft = useRef<TaskDraft | null>(null);
  const taskEditorOpen = useRef(false);
  const taskEditorSession = useRef(0);

  const invalidateTask = keysAffectedByTaskChange(id);

  const { completeCommand, unassignTask } = useTaskRowCommands(client, id);

  const saveTask = useCommand(
    (
      requestId,
      input: {
        readonly taskId: string | null;
        readonly editorSession: number;
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
      onSuccess: (savedTask, input) => {
        if (!taskEditorOpen.current || input.editorSession !== taskEditorSession.current) return;
        if (JSON.stringify(latestDraft.current) !== JSON.stringify(submittedDraft.current)) {
          // The response is the confirmed server version. Keep the newer draft
          // mounted so the user can choose its fields before another save.
          setEditingTask(savedTask);
          setAddingTask(false);
          setReviewedTask(savedTask);
          setReviewError(false);
          return;
        }
        taskEditorOpen.current = false;
        setEditingTask(null);
        setAddingTask(false);
        setReviewedTask(null);
      },
    },
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

  if (list.isPending) return <LoadingState label={t('state.loading')} />;
  const pages = list.data?.pages ?? [];
  const page = pages[0];
  if (page === undefined) {
    return (
      <Screen title={t('list.not_found')}>
        <SecondaryButton label={t('list.back')} onPress={() => router.back()} />
      </Screen>
    );
  }

  const ordered = sortTasksInList(pages.flatMap((entry) => entry.tasks));
  const isTemplate = page.list.kind === 'template';
  const taskConflict = saveTask.state.error?.code === 'CONFLICT';

  return (
    <Screen backLabel={t('list.back')} onBack={() => router.back()} title={page.list.title}>
      <FlatList
        contentContainerStyle={styles.content}
        data={ordered}
        keyExtractor={(task) => task.id}
        onScroll={nav.onScroll}
        scrollEventThrottle={16}
        ListHeaderComponent={
          <>
            {list.isError && !list.isFetchNextPageError && (
              <ErrorBanner
                error={{ code: 'UNKNOWN', message_key: 'error.unknown' }}
                onRetry={() => void list.refetch()}
                t={t}
              />
            )}
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
              onEdit={listEditor.open}
              onSaveTemplate={() => {
                setTemplateSaved(false);
                void saveTemplate.run({ listId: page.list.id });
              }}
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
                { error: saveTemplate.state.error, retry: () => void saveTemplate.retry() },
              ]}
              t={t}
            />
          </>
        }
        ListEmptyComponent={<EmptyState label={t('list.empty')} />}
        renderItem={({ item }) => (
          <ListTasks
            busy={anyPending([completeCommand.state, removeTask.state, unassignTask.state])}
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
            onEdit={(selected) => {
              if (saveTask.state.pending) return;
              saveTask.reset();
              taskEditorOpen.current = true;
              taskEditorSession.current += 1;
              latestDraft.current = null;
              submittedDraft.current = null;
              setReviewedTask(null);
              setReviewError(false);
              setEditingTask(ordered.find((task) => task.id === selected.id) ?? null);
            }}
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
            tasks={[item]}
          />
        )}
        ListFooterComponent={
          <>
            <LoadMore
              hasNextPage={list.hasNextPage}
              isFetchingNextPage={list.isFetchingNextPage}
              isFetchNextPageError={list.isFetchNextPageError}
              onPress={() => void list.fetchNextPage()}
              t={t}
            />
            <NavSpacer />
          </>
        }
      />

      <AddTaskFab
        isTemplate={isTemplate || saveTask.state.pending}
        label={t('list.add_task')}
        onPress={() => {
          saveTask.reset();
          taskEditorOpen.current = true;
          taskEditorSession.current += 1;
          latestDraft.current = null;
          submittedDraft.current = null;
          setAddingTask(true);
        }}
      />

      {(addingTask || editingTask !== null) && (
        <TaskEditor
          conflict={taskConflict}
          error={saveTask.state.error}
          latestTask={taskConflict ? null : reviewedTask}
          locale={locale}
          members={members.data ?? []}
          onCancel={() => {
            taskEditorOpen.current = false;
            saveTask.reset();
            setEditingTask(null);
            setAddingTask(false);
            setReviewedTask(null);
            setReviewError(false);
          }}
          onReviewConflict={() => {
            if (editingTask === null || reviewingConflict) return;
            setReviewedTask(null);
            setReviewError(false);
            setReviewingConflict(true);
            void list.refetch().then((result) => {
              const latest = result.data?.pages
                .flatMap((entry) => entry.tasks)
                .find((task) => task.id === editingTask.id);
              if (result.isError || latest === undefined) {
                setReviewError(true);
              } else {
                setReviewedTask(latest);
                saveTask.reset();
              }
              setReviewingConflict(false);
            });
          }}
          onRetry={() => void saveTask.retry()}
          onDraftChange={(draft) => {
            latestDraft.current = draft;
          }}
          onSubmit={(input, draft) => {
            if (saveTask.state.error?.code === 'NETWORK') return;
            latestDraft.current = draft;
            submittedDraft.current = draft;
            void saveTask.run({
              taskId: editingTask?.id ?? null,
              editorSession: taskEditorSession.current,
              expectedVersion: reviewedTask?.version ?? editingTask?.version ?? 0,
              title: input.title,
              notes: input.notes,
              assigneeId: input.assigneeId,
              dueAt: input.dueAt,
            });
          }}
          pending={saveTask.state.pending}
          reviewError={reviewError}
          reviewingConflict={reviewingConflict}
          t={t}
          task={editingTask}
        />
      )}

      {listEditor.editing && (
        <ListEditor
          error={listEditor.command.state.error}
          list={listEditor.confirmedList ?? page.list}
          onCancel={listEditor.cancel}
          onDraftChange={listEditor.onDraftChange}
          onSubmit={(input, draft) => listEditor.submit(input, draft, page.list)}
          pending={listEditor.command.state.pending}
          retainedDraft={listEditor.retainedDraft}
          onRetry={() => void listEditor.command.retry()}
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
