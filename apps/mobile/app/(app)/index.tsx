import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { ListSummaryDto } from '@odin/contracts';
import {
  copyTemplate,
  createList,
  deleteList,
  keysAffectedByListChange,
  keysAffectedByTaskChange,
  useCommand,
} from '@odin/data';

import { useNavVisibility } from '../../src/state/NavVisibility.tsx';
import { useOdin } from '../../src/state/OdinContext.ts';
import { useHomeQuery } from '../../src/state/queries.ts';
import { ErrorBanner } from '../../src/components/Banner.tsx';
import { NavSpacer } from '../../src/components/BottomNav.tsx';
import { FloatingActionButton } from '../../src/components/FloatingActionButton.tsx';
import { ListCard } from '../../src/components/ListCard.tsx';
import { ListEditor } from '../../src/components/ListEditor.tsx';
import { EmptyState, LoadingState, Screen } from '../../src/components/Screen.tsx';
import { useTheme } from '../../src/theme.ts';

/**
 * Home shows two clearly labelled sections. `get_home` returns both kinds in
 * one id-ordered page, so the split into Templates and Active lists happens
 * here rather than in two round trips.
 */

export default function HomeScreen(): ReactNode {
  const { t } = useOdin();
  const theme = useTheme();
  const nav = useNavVisibility();
  const home = useHomeQuery(true);
  const { client } = useOdin();
  const [creating, setCreating] = useState(false);

  const copy = useCommand(
    (requestId, input: { readonly templateId: string }) =>
      copyTemplate(client, requestId, input.templateId),
    {
      invalidate: [...keysAffectedByListChange(), ...keysAffectedByTaskChange()],
      onSuccess: (listId) => router.push({ pathname: '/list/[id]', params: { id: listId } }),
    },
  );

  const create = useCommand(
    (requestId, input: { readonly title: string; readonly subtitle: string | null }) =>
      createList(client, requestId, input),
    { invalidate: keysAffectedByListChange(), onSuccess: () => setCreating(false) },
  );

  const remove = useCommand(
    (requestId, input: { readonly listId: string; readonly expectedVersion: number }) =>
      deleteList(client, requestId, input),
    { invalidate: keysAffectedByListChange() },
  );

  if (home.isPending) return <LoadingState label={t('state.loading')} />;

  const templates = home.data?.items.filter((item) => item.kind === 'template') ?? [];
  const active = home.data?.items.filter((item) => item.kind === 'active') ?? [];

  const section = (
    heading: string,
    items: readonly ListSummaryDto[],
    emptyLabel: string,
    onCopy?: (list: ListSummaryDto) => void,
  ): ReactNode => (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.heading, { color: theme.colors.text }]}>
        {heading}
      </Text>
      {items.length === 0 ? (
        <EmptyState label={emptyLabel} />
      ) : (
        items.map((item) => (
          <ListCard
            copyPending={copy.state.pending}
            key={item.id}
            list={item}
            onCopy={onCopy}
            onDelete={
              item.kind === 'active'
                ? (selected) => {
                    Alert.alert(t('list.delete'), t('list.delete.confirm'), [
                      { text: t('list.back'), style: 'cancel' },
                      {
                        text: t('list.delete'),
                        style: 'destructive',
                        onPress: () =>
                          void remove.run({
                            listId: selected.id,
                            expectedVersion: selected.version,
                          }),
                      },
                    ]);
                  }
                : undefined
            }
            deletePending={remove.state.pending}
            t={t}
          />
        ))
      )}
    </View>
  );

  return (
    <Screen title={t('home.title')}>
      <ScrollView
        contentContainerStyle={styles.content}
        onScroll={nav.onScroll}
        scrollEventThrottle={16}
      >
        {home.isError && (
          <ErrorBanner
            error={{ code: 'UNKNOWN', message_key: 'error.unknown' }}
            onRetry={() => void home.refetch()}
            t={t}
          />
        )}
        {copy.state.error !== null && <ErrorBanner error={copy.state.error} t={t} />}
        {remove.state.error !== null && <ErrorBanner error={remove.state.error} t={t} />}

        {section(
          t('home.templates.heading'),
          templates,
          t('home.templates.empty'),
          (list) => void copy.run({ templateId: list.id }),
        )}
        {section(t('home.active.heading'), active, t('home.active.empty'))}

        <NavSpacer />
      </ScrollView>

      <FloatingActionButton label={t('home.create_list')} onPress={() => setCreating(true)} />

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
  content: { gap: 16, paddingBottom: 16 },
  heading: { fontSize: 18, fontWeight: '700' },
  section: { gap: 12 },
});
