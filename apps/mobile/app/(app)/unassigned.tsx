import type { ReactNode } from 'react';
import { FlatList, StyleSheet } from 'react-native';

import { taskRowFromCrossList, type CrossListTaskDto } from '@odin/contracts';
import { claimTask, keysAffectedByTaskChange, useCommand } from '@odin/data';
import { sortTasksByDue } from '@odin/domain';

import { useNavVisibility } from '../../src/state/NavVisibility.tsx';
import { useOdin } from '../../src/state/OdinContext.ts';
import { useMembersQuery, useUnassignedQuery } from '../../src/state/queries.ts';
import { ErrorBanner } from '../../src/components/Banner.tsx';
import { NavSpacer } from '../../src/components/BottomNav.tsx';
import { LoadMore } from '../../src/components/LoadMore.tsx';
import { EmptyState, LoadingState, Screen } from '../../src/components/Screen.tsx';
import { TaskRow } from '../../src/components/TaskRow.tsx';

/**
 * Unassigned work across every open active list. Claiming is never optimistic:
 * a concurrent claim legitimately loses with ALREADY_ASSIGNED, so the row only
 * changes once the server has confirmed the winner.
 */

export default function UnassignedScreen(): ReactNode {
  const { t, locale, client } = useOdin();
  const nav = useNavVisibility();
  const tasks = useUnassignedQuery(true);
  const members = useMembersQuery(true);

  const claim = useCommand(
    (requestId, input: { readonly taskId: string; readonly expectedVersion: number }) =>
      claimTask(client, requestId, input),
    { invalidate: keysAffectedByTaskChange() },
  );

  if (tasks.isPending) return <LoadingState label={t('state.loading')} />;

  // Normalising first gives every row the `id` the shared due ordering needs.
  const items: readonly CrossListTaskDto[] = tasks.data?.pages.flatMap((page) => page.items) ?? [];
  const rows = sortTasksByDue(items.map((task) => taskRowFromCrossList(task, null)));

  return (
    <Screen title={t('unassigned.title')}>
      <FlatList
        contentContainerStyle={styles.content}
        data={rows}
        keyExtractor={(task) => task.id}
        ListHeaderComponent={
          <>
            {tasks.isError && !tasks.isFetchNextPageError && (
              <ErrorBanner
                error={{ code: 'UNKNOWN', message_key: 'error.unknown' }}
                onRetry={() => void tasks.refetch()}
                t={t}
              />
            )}
            {claim.state.error !== null && (
              <ErrorBanner
                error={claim.state.error}
                onRetry={
                  claim.state.error.code === 'NETWORK' ? () => void claim.retry() : undefined
                }
                t={t}
              />
            )}
          </>
        }
        ListEmptyComponent={<EmptyState label={t('unassigned.empty')} />}
        ListFooterComponent={
          <>
            <LoadMore
              hasNextPage={tasks.hasNextPage}
              isFetchingNextPage={tasks.isFetchingNextPage}
              isFetchNextPageError={tasks.isFetchNextPageError}
              onPress={() => void tasks.fetchNextPage()}
              t={t}
            />
            <NavSpacer />
          </>
        }
        onScroll={nav.onScroll}
        renderItem={({ item: task }) => (
          <TaskRow
            busy={claim.state.pending}
            locale={locale}
            members={members.data ?? []}
            onClaim={(selected) =>
              void claim.run({ taskId: selected.id, expectedVersion: selected.version })
            }
            t={t}
            task={task}
          />
        )}
        scrollEventThrottle={16}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingBottom: 16 },
});
