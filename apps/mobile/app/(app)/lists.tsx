import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ListSummaryDto, MoveDirection } from '@odin/contracts';
import {
  copyTemplate,
  createList,
  deleteList,
  keysAffectedByListChange,
  keysAffectedByTaskChange,
  moveList,
  saveListTemplate,
  useCommand,
} from '@odin/data';
import { adjacentMoves } from '@odin/domain';

import { useNavVisibility } from '../../src/state/NavVisibility.tsx';
import { useOdin } from '../../src/state/OdinContext.ts';
import { useHomeQuery } from '../../src/state/queries.ts';
import { useEvent } from '../../src/state/useEvent.ts';
import { ErrorBanner } from '../../src/components/Banner.tsx';
import { Segmented, Surface } from '../../src/components/Blocks.tsx';
import { NavSpacer } from '../../src/components/BottomNav.tsx';
import { FloatingActionButton } from '../../src/components/FloatingActionButton.tsx';
import { ListCard } from '../../src/components/ListCard.tsx';
import { ListEditor } from '../../src/components/ListEditor.tsx';
import { EmptyState, LoadingState, Screen } from '../../src/components/Screen.tsx';
import { showToast } from '../../src/components/toast.ts';
import { useTheme } from '../../src/theme.ts';

/**
 * Lists: active lists and list templates as two tabs. Templates are used from
 * their own tab instead of taking the top of the first screen, and reordering
 * is a mode so the arrows are not on every row.
 */

type Tab = 'active' | 'templates';

function useListCommands() {
  const { t, client } = useOdin();
  const copy = useCommand(
    (requestId, input: { readonly templateId: string }) =>
      copyTemplate(client, requestId, input.templateId),
    {
      invalidate: [...keysAffectedByListChange(), ...keysAffectedByTaskChange()],
      onSuccess: (listId) => router.push({ pathname: '/list/[id]', params: { id: listId } }),
    },
  );
  const create = useCommand(
    (
      requestId,
      input: {
        readonly title: string;
        readonly subtitle: string | null;
        readonly notes: string | null;
      },
    ) => createList(client, requestId, input),
    {
      invalidate: keysAffectedByListChange(),
      onSuccess: (list) => router.push({ pathname: '/list/[id]', params: { id: list.id } }),
    },
  );
  const saveTemplate = useCommand(
    (requestId, input: { readonly listId: string }) =>
      saveListTemplate(client, requestId, input.listId),
    {
      invalidate: keysAffectedByListChange(),
      onSuccess: () => showToast(t('toast.template_saved')),
    },
  );
  const remove = useCommand(
    (requestId, input: { readonly listId: string; readonly expectedVersion: number }) =>
      deleteList(client, requestId, input),
    { invalidate: keysAffectedByListChange() },
  );
  const reorder = useCommand(
    (
      requestId,
      input: {
        readonly listId: string;
        readonly expectedVersion: number;
        readonly direction: MoveDirection;
      },
    ) => moveList(client, requestId, input),
    { invalidate: keysAffectedByListChange() },
  );
  return { copy, create, saveTemplate, remove, reorder };
}

export default function ListsScreen(): ReactNode {
  const { t } = useOdin();
  const theme = useTheme();
  const nav = useNavVisibility();
  const home = useHomeQuery();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'templates' ? 'templates' : 'active');
  const [reordering, setReordering] = useState(false);
  const [creating, setCreating] = useState(false);
  const { copy, create, saveTemplate, remove, reorder } = useListCommands();

  const copyList = useEvent((list: ListSummaryDto) => void copy.run({ templateId: list.id }));
  const move = useEvent(
    (list: ListSummaryDto, direction: MoveDirection) =>
      void reorder.run({ listId: list.id, expectedVersion: list.version, direction }),
  );
  const saveAsTemplate = useEvent(
    (list: ListSummaryDto) => void saveTemplate.run({ listId: list.id }),
  );
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
  const errors = [copy, saveTemplate, remove, reorder].flatMap((command) =>
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
        {home.isError && (
          <ErrorBanner
            error={{ code: 'UNKNOWN', message_key: 'error.unknown' }}
            onRetry={() => void home.refetch()}
            t={t}
          />
        )}
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
                  movePending={reorder.state.pending}
                  onCopy={copyList}
                  onDelete={confirmDelete}
                  onMove={move}
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
