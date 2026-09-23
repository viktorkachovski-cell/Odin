import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, SectionList, StyleSheet, Text } from 'react-native';

import {
  copyTemplate,
  deleteList,
  keysAffectedByListChange,
  keysAffectedByTaskChange,
  saveListTemplate,
  useCommand,
} from '@odin/data';

import { useNavVisibility } from '../../src/state/NavVisibility.tsx';
import { useOdin } from '../../src/state/OdinContext.ts';
import { useHomeQuery } from '../../src/state/queries.ts';
import { useListEditorCommand } from '../../src/state/useListEditorCommand.ts';
import { ErrorBanner } from '../../src/components/Banner.tsx';
import { NavSpacer } from '../../src/components/BottomNav.tsx';
import { FloatingActionButton } from '../../src/components/FloatingActionButton.tsx';
import { ListCard } from '../../src/components/ListCard.tsx';
import { ListEditor } from '../../src/components/ListEditor.tsx';
import { LoadMore } from '../../src/components/LoadMore.tsx';
import { EmptyState, LoadingState, Screen } from '../../src/components/Screen.tsx';
import { useTheme } from '../../src/theme.ts';

/**
 * Home shows two clearly labelled sections. `get_home` returns both kinds in
 * one id-ordered page, so the split into List templates and Active lists
 * happens here rather than in two round trips. Task templates are a separate
 * type and are loaded from inside the task editor, never from Home.
 */

export default function HomeScreen(): ReactNode {
  const { t } = useOdin();
  const theme = useTheme();
  const nav = useNavVisibility();
  const home = useHomeQuery(true);
  const { client } = useOdin();
  const listEditor = useListEditorCommand(client);
  const [templateSaved, setTemplateSaved] = useState(false);

  const copy = useCommand(
    (requestId, input: { readonly templateId: string }) =>
      copyTemplate(client, requestId, input.templateId),
    {
      invalidate: [...keysAffectedByListChange(), ...keysAffectedByTaskChange()],
      onSuccess: (listId) => router.push({ pathname: '/list/[id]', params: { id: listId } }),
    },
  );

  // Saving a list template writes a new list, so Home is the cache to refresh;
  // the new template card appearing is itself most of the confirmation.
  const saveTemplate = useCommand(
    (requestId, input: { readonly listId: string }) =>
      saveListTemplate(client, requestId, input.listId),
    { invalidate: keysAffectedByListChange(), onSuccess: () => setTemplateSaved(true) },
  );

  const remove = useCommand(
    (requestId, input: { readonly listId: string; readonly expectedVersion: number }) =>
      deleteList(client, requestId, input),
    { invalidate: keysAffectedByListChange() },
  );

  if (home.isPending) return <LoadingState label={t('state.loading')} />;

  const items = home.data?.pages.flatMap((page) => page.items) ?? [];
  const templates = items.filter((item) => item.kind === 'template');
  const active = items.filter((item) => item.kind === 'active');

  const sections = [
    { title: t('home.templates.heading'), empty: t('home.templates.empty'), data: templates },
    { title: t('home.active.heading'), empty: t('home.active.empty'), data: active },
  ];

  return (
    <Screen title={t('home.title')}>
      <SectionList
        contentContainerStyle={styles.content}
        keyExtractor={(item) => item.id}
        sections={sections}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text accessibilityRole="header" style={[styles.heading, { color: theme.colors.text }]}>
            {section.title}
          </Text>
        )}
        renderSectionFooter={({ section }) =>
          section.data.length === 0 && !home.hasNextPage ? (
            <EmptyState label={section.empty} />
          ) : null
        }
        renderItem={({ item }) => (
          <ListCard
            copyPending={copy.state.pending}
            list={item}
            onCopy={
              item.kind === 'template'
                ? (selected) => void copy.run({ templateId: selected.id })
                : undefined
            }
            onDelete={(selected) => {
              Alert.alert(t('list.delete'), t('list.delete.confirm'), [
                { text: t('list.back'), style: 'cancel' },
                {
                  text: t('list.delete'),
                  style: 'destructive',
                  onPress: () =>
                    void remove.run({ listId: selected.id, expectedVersion: selected.version }),
                },
              ]);
            }}
            deletePending={remove.state.pending}
            onSaveTemplate={
              item.kind === 'active'
                ? (selected) => {
                    setTemplateSaved(false);
                    void saveTemplate.run({ listId: selected.id });
                  }
                : undefined
            }
            saveTemplatePending={saveTemplate.state.pending}
            t={t}
          />
        )}
        ListHeaderComponent={
          <>
            {home.isError && (
              <ErrorBanner
                error={{ code: 'UNKNOWN', message_key: 'error.unknown' }}
                onRetry={() => void home.refetch()}
                t={t}
              />
            )}
            {copy.state.error !== null && (
              <ErrorBanner
                error={copy.state.error}
                onRetry={copy.state.error.code === 'NETWORK' ? () => void copy.retry() : undefined}
                t={t}
              />
            )}
            {remove.state.error !== null && (
              <ErrorBanner
                error={remove.state.error}
                onRetry={
                  remove.state.error.code === 'NETWORK' ? () => void remove.retry() : undefined
                }
                t={t}
              />
            )}
            {saveTemplate.state.error !== null && (
              <ErrorBanner
                error={saveTemplate.state.error}
                onRetry={
                  saveTemplate.state.error.code === 'NETWORK'
                    ? () => void saveTemplate.retry()
                    : undefined
                }
                t={t}
              />
            )}
            {templateSaved && saveTemplate.state.error === null && (
              <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.textMuted }}>
                {t('list.template.saved')}
              </Text>
            )}
          </>
        }
        ListFooterComponent={
          <>
            <LoadMore
              hasNextPage={home.hasNextPage}
              isFetchingNextPage={home.isFetchingNextPage}
              isFetchNextPageError={home.isFetchNextPageError}
              onPress={() => void home.fetchNextPage()}
              t={t}
            />
            <NavSpacer />
          </>
        }
        onScroll={nav.onScroll}
        scrollEventThrottle={16}
      />

      <FloatingActionButton
        disabled={listEditor.command.state.pending}
        label={t('home.create_list')}
        onPress={listEditor.open}
      />

      {listEditor.editing && (
        <ListEditor
          error={listEditor.command.state.error}
          list={listEditor.confirmedList}
          onCancel={listEditor.cancel}
          onDraftChange={listEditor.onDraftChange}
          onSubmit={(input, draft) => listEditor.submit(input, draft, null)}
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
  content: { gap: 16, paddingBottom: 16 },
  heading: { fontSize: 18, fontWeight: '700' },
});
