import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import type { ListSummaryDto, MoveDirection } from '@odin/contracts';
import { useListActions } from '@odin/data';
import { adjacentMoves } from '@odin/domain';

import { useOdin } from '../../src/state/OdinContext.ts';
import { useHomeQuery, useProjectsQuery } from '../../src/state/queries.ts';
import { useEvent } from '../../src/state/useEvent.ts';
import { ErrorBanner, LoadFailure } from '../../src/components/Banner.tsx';
import { Segmented, Surface } from '../../src/components/Blocks.tsx';
import { NavSpacer } from '../../src/components/BottomNav.tsx';
import { FloatingActionButton } from '../../src/components/FloatingActionButton.tsx';
import { ListCard } from '../../src/components/ListCard.tsx';
import { ListEditor } from '../../src/components/ListEditor.tsx';
import { ListsBody, ListsToolbar, type ListsTab } from '../../src/components/ListsBody.tsx';
import { useProjectSheets } from '../../src/components/useProjectSheets.tsx';
import { LoadingState } from '../../src/components/Screen.tsx';
import { HouseholdScreen } from '../../src/components/HouseholdScreen.tsx';
import { showToast } from '../../src/components/toast.ts';

/**
 * Lists: active lists and list templates as two tabs. Reordering is a mode, so
 * the arrows are not on every row.
 *
 * Once the household has a project, the Active tab groups its lists under
 * their projects. Templates are never in a project.
 */

export default function ListsScreen(): ReactNode {
  const { t, client } = useOdin();
  const home = useHomeQuery();
  const projectsQuery = useProjectsQuery();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<ListsTab>(params.tab === 'templates' ? 'templates' : 'active');
  const [reordering, setReordering] = useState(false);
  /** The project a new list starts in; null while the editor is closed. */
  const [creating, setCreating] = useState<{ readonly projectId: string | null } | null>(null);
  const { copy, create, saveTemplate, remove, move } = useListActions(client, undefined, {
    opened: (id) => router.push({ pathname: '/list/[id]', params: { id } }),
    templateSaved: () => showToast(t('toast.template_saved')),
  });
  const projects = projectsQuery.data?.items ?? [];
  const projectUi = useProjectSheets(projects);

  const copyList = useEvent((list: ListSummaryDto) => void copy.run(list.id));
  const moveList = useEvent(
    (list: ListSummaryDto, direction: MoveDirection) =>
      void move.run({ listId: list.id, expectedVersion: list.version, direction }),
  );
  const saveAsTemplate = useEvent((list: ListSummaryDto) => void saveTemplate.run(list.id));
  const confirmDelete = useEvent((list: ListSummaryDto) =>
    Alert.alert(t('list.delete.title'), t('list.delete.confirm'), [
      { text: t('action.cancel'), style: 'cancel' },
      {
        text: t('list.delete'),
        style: 'destructive',
        onPress: () => void remove.run({ listId: list.id, expectedVersion: list.version }),
      },
    ]),
  );

  if (home.isPending) return <LoadingState />;

  const templates = home.data?.items.filter((item) => item.kind === 'template') ?? [];
  const active = home.data?.items.filter((item) => item.kind === 'active') ?? [];
  const shown = tab === 'templates' ? templates : active;
  const commands = [copy, saveTemplate, remove, move];
  const busy = projectUi.busy || commands.some((command) => command.state.pending);
  const errors = [
    ...commands.flatMap((command) => (command.state.error === null ? [] : [command.state.error])),
    ...projectUi.errors,
  ];

  /** Cards for one group; a move only ever swaps within its own group. */
  const renderCards = (rows: readonly ListSummaryDto[]): ReactNode => (
    <View style={styles.cards}>
      {rows.map((list, index) => {
        const moves = adjacentMoves(rows, index, (item) => item.kind);
        return (
          <Surface key={list.id}>
            <ListCard
              copyPending={copy.state.pending}
              deletePending={remove.state.pending}
              list={list}
              moveDownDisabled={!moves.down}
              moveUpDisabled={!moves.up}
              movePending={move.state.pending}
              onCopy={copyList}
              onDelete={confirmDelete}
              onMove={moveList}
              onMoveToProject={
                tab === 'active' && projects.length > 0 ? projectUi.moveList : undefined
              }
              onSaveTemplate={saveAsTemplate}
              reorder={reordering}
              saveTemplatePending={saveTemplate.state.pending}
              t={t}
            />
          </Surface>
        );
      })}
    </View>
  );

  return (
    <HouseholdScreen title={t('lists.title')}>
      <ScrollView contentContainerStyle={styles.content}>
        <Segmented
          onChange={(next) => {
            setReordering(false);
            setTab(next);
          }}
          options={[
            { key: 'active', label: t('lists.tab.active'), count: active.length },
            { key: 'templates', label: t('lists.tab.templates'), count: templates.length },
          ]}
          value={tab}
        />
        {home.isError && <LoadFailure onRetry={() => void home.refetch()} t={t} />}
        {projectsQuery.isError && (
          <LoadFailure onRetry={() => void projectsQuery.refetch()} t={t} />
        )}
        {errors.map((error, index) => (
          <ErrorBanner error={error} key={`${error.message_key}-${String(index)}`} t={t} />
        ))}

        <ListsToolbar
          busy={busy}
          onNewProject={projectUi.newProject}
          onToggleReorder={() => setReordering((current) => !current)}
          reorderable={shown.length > 1}
          reordering={reordering}
          t={t}
          tab={tab}
        />

        <ListsBody
          active={active}
          busy={busy}
          onAddList={(project) => setCreating({ projectId: project.id })}
          onDelete={projectUi.deleteProject}
          onRename={projectUi.renameProject}
          projects={projects}
          renderCards={renderCards}
          shown={shown}
          t={t}
          tab={tab}
        />
        <NavSpacer />
      </ScrollView>

      <FloatingActionButton
        label={t('lists.new')}
        onPress={() => setCreating({ projectId: null })}
      />

      {creating !== null && (
        <ListEditor
          error={create.state.error}
          initialProjectId={creating.projectId}
          list={null}
          onCancel={() => {
            create.reset();
            setCreating(null);
          }}
          onSubmit={(input) => void create.run(input)}
          pending={create.state.pending}
          projects={projects}
          t={t}
        />
      )}

      {projectUi.sheets}
    </HouseholdScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingBottom: 16 },
  cards: { gap: 12 },
});
