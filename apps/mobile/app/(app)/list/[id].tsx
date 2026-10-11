import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { useListActions } from '@odin/data';
import { sortTasksInList } from '@odin/domain';

import { useNavVisibility } from '../../../src/state/NavVisibility.tsx';
import { useOdin } from '../../../src/state/OdinContext.ts';
import { NO_MEMBERS, useListQuery, useMembersQuery } from '../../../src/state/queries.ts';
import { Surface } from '../../../src/components/Blocks.tsx';
import { NavSpacer } from '../../../src/components/BottomNav.tsx';
import { InlineError } from '../../../src/components/Banner.tsx';
import { SecondaryButton } from '../../../src/components/Button.tsx';
import { ListEditor } from '../../../src/components/ListEditor.tsx';
import {
  CommandErrors,
  ListHeader,
  ListMeta,
  ListTasks,
  QuickAddBar,
} from '../../../src/components/ListDetailSections.tsx';
import { Progress } from '../../../src/components/Progress.tsx';
import { EmptyState, LoadingState, Screen } from '../../../src/components/Screen.tsx';
import { showToast } from '../../../src/components/toast.ts';
import { useTaskWiring } from '../../../src/components/useTaskWiring.tsx';

/**
 * List detail: progress, subtitle and the shared note, then the tasks, with a
 * quick add pinned above the navigation. A task opens straight into its editor.
 */

export default function ListDetailScreen(): ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, locale, client } = useOdin();
  const nav = useNavVisibility();
  const list = useListQuery(id);
  const members = useMembersQuery().data ?? NO_MEMBERS;
  const isTemplate = list.data?.list.kind === 'template';
  const wiring = useTaskWiring({ members, listId: id, editable: !isTemplate });
  const [editingList, setEditingList] = useState(false);
  const [reorder, setReorder] = useState(false);
  const {
    update: saveList,
    saveTemplate,
    remove: removeList,
    addTask,
  } = useListActions(client, id, {
    templateSaved: () => showToast(t('toast.template_saved')),
    deleted: () => router.replace('/lists'),
  });

  // The quick add sits on the navigation, so the navigation stays put here.
  const { pin } = nav;
  useEffect(() => {
    pin(true);
    return () => pin(false);
  }, [pin]);

  if (list.isPending) return <LoadingState />;
  if (list.data === undefined) {
    return (
      <Screen title={t('list.not_found')}>
        <SecondaryButton label={t('lists.title')} onPress={() => router.replace('/lists')} />
      </Screen>
    );
  }

  const page = list.data;
  const ordered = sortTasksInList(page.tasks);

  return (
    <Screen
      backLabel={t('lists.title')}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/lists'))}
      title={page.list.title}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <ListMeta notes={page.list.notes} subtitle={page.list.subtitle} t={t} />
          </View>
          <ListHeader
            canReorder={ordered.length > 1}
            isTemplate={isTemplate}
            onDelete={() =>
              Alert.alert(t('list.delete.title'), t('list.delete.confirm'), [
                { text: t('action.cancel'), style: 'cancel' },
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
            onSaveTemplate={() => void saveTemplate.run(page.list.id)}
            onToggleReorder={() => setReorder((current) => !current)}
            pending={removeList.state.pending || saveTemplate.state.pending}
            reorder={reorder}
            t={t}
          />
        </View>
        {!isTemplate && (
          <Progress completed={page.completed_tasks} t={t} total={page.total_tasks} />
        )}

        {wiring.errors}
        <CommandErrors
          errors={[
            { error: removeList.state.error, retry: () => void removeList.retry() },
            { error: saveTemplate.state.error, retry: () => void saveTemplate.retry() },
          ]}
          t={t}
        />
        <InlineError error={addTask.state.error} t={t} />

        {ordered.length === 0 ? (
          <EmptyState label={t('list.empty')} />
        ) : (
          <Surface>
            <ListTasks
              busy={wiring.actions.busy}
              handlers={wiring.handlers}
              isTemplate={isTemplate}
              locale={locale}
              members={members}
              onMove={wiring.actions.move}
              reorder={reorder}
              t={t}
              tasks={ordered}
            />
          </Surface>
        )}

        <NavSpacer />
        {!isTemplate && <View style={styles.quickSpacer} />}
      </ScrollView>

      {!isTemplate && (
        <QuickAddBar
          onAdd={(title, done) =>
            void addTask.run(title).then((result) => {
              if (result.ok) done();
            })
          }
          pending={addTask.state.pending}
          t={t}
        />
      )}

      {wiring.overlays}

      {editingList && (
        <ListEditor
          error={saveList.state.error}
          list={page.list}
          onCancel={() => {
            saveList.reset();
            setEditingList(false);
          }}
          onSubmit={(input) =>
            void saveList.run({ expectedVersion: page.list.version, ...input }).then((result) => {
              if (result.ok) setEditingList(false);
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
  headerRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8, marginTop: -8 },
  headerText: { flex: 1, minWidth: 0 },
  quickSpacer: { height: 72 },
});
