import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ListSummaryDto, MoveDirection } from '@odin/contracts';
import { useListActions } from '@odin/data';
import { adjacentMoves } from '@odin/domain';

import { useNavVisibility } from '../../src/state/NavVisibility.tsx';
import { useOdin } from '../../src/state/OdinContext.ts';
import { useHomeQuery } from '../../src/state/queries.ts';
import { useEvent } from '../../src/state/useEvent.ts';
import { ErrorBanner, LoadFailure } from '../../src/components/Banner.tsx';
import { Segmented, Surface } from '../../src/components/Blocks.tsx';
import { NavSpacer } from '../../src/components/BottomNav.tsx';
import { FloatingActionButton } from '../../src/components/FloatingActionButton.tsx';
import { ListCard } from '../../src/components/ListCard.tsx';
import { ListEditor } from '../../src/components/ListEditor.tsx';
import { EmptyState, LoadingState, Screen } from '../../src/components/Screen.tsx';
import { showToast } from '../../src/components/toast.ts';
import { useTheme } from '../../src/theme.ts';

/**
 * Lists: active lists and list templates as two tabs. Reordering is a mode, so
 * the arrows are not on every row.
 */

type Tab = 'active' | 'templates';

export default function ListsScreen(): ReactNode {
  const { t, client } = useOdin();
  const theme = useTheme();
  const nav = useNavVisibility();
  const home = useHomeQuery();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'templates' ? 'templates' : 'active');
  const [reordering, setReordering] = useState(false);
  const [creating, setCreating] = useState(false);
  const { copy, create, saveTemplate, remove, move } = useListActions(client, undefined, {
    opened: (id) => router.push({ pathname: '/list/[id]', params: { id } }),
    templateSaved: () => showToast(t('toast.template_saved')),
  });

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
  const errors = [copy, saveTemplate, remove, move].flatMap((command) =>
    command.state.error === null ? [] : [command.state.error],
  );

  return (
    <Screen title={t('lists.title')}>
      <ScrollView
        contentContainerStyle={styles.content}
        onScroll={nav.onScroll}
        scrollEventThrottle={16}
      >
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
        {errors.map((error, index) => (
          <ErrorBanner error={error} key={`${error.message_key}-${String(index)}`} t={t} />
        ))}

        {shown.length > 1 && (
          <View style={styles.toolbar}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: reordering }}
              onPress={() => setReordering((current) => !current)}
              style={[styles.reorder, { minHeight: theme.touchTarget }]}
            >
              <Text style={[styles.reorderText, { color: theme.colors.accent }]}>
                {reordering ? t('lists.reorder.done') : t('lists.reorder')}
              </Text>
            </Pressable>
          </View>
        )}

        {shown.length === 0 ? (
          <EmptyState
            label={tab === 'templates' ? t('lists.templates.empty') : t('home.active.empty')}
          />
        ) : (
          <Surface>
            {shown.map((list, index) => {
              const moves = adjacentMoves(shown, index, (item) => item.kind);
              return (
                <ListCard
                  copyPending={copy.state.pending}
                  deletePending={remove.state.pending}
                  key={list.id}
                  list={list}
                  moveDownDisabled={!moves.down}
                  moveUpDisabled={!moves.up}
                  movePending={move.state.pending}
                  onCopy={copyList}
                  onDelete={confirmDelete}
                  onMove={moveList}
                  onSaveTemplate={saveAsTemplate}
                  reorder={reordering}
                  saveTemplatePending={saveTemplate.state.pending}
                  t={t}
                />
              );
            })}
          </Surface>
        )}
        <NavSpacer />
      </ScrollView>

      <FloatingActionButton label={t('lists.new')} onPress={() => setCreating(true)} />

      {creating && (
        <ListEditor
          error={create.state.error}
          list={null}
          onCancel={() => {
            create.reset();
            setCreating(false);
          }}
          onSubmit={(input) => void create.run(input)}
          pending={create.state.pending}
          t={t}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingBottom: 16 },
  reorder: { justifyContent: 'center', paddingHorizontal: 4 },
  reorderText: { fontSize: 15, fontWeight: '600' },
  toolbar: { alignItems: 'flex-end', marginVertical: -8 },
});
