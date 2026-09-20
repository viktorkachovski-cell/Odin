import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { taskRowFromCrossList, type CrossListTaskDto } from '@odin/contracts';
import { keysAffectedByTaskChange, setTaskCompleted, useCommand } from '@odin/data';
import { sortTasksByDue } from '@odin/domain';

import { useNavVisibility } from '../../src/state/NavVisibility.tsx';
import { useOdin } from '../../src/state/OdinContext.ts';
import { useMembersQuery, useMyTasksQuery } from '../../src/state/queries.ts';
import { ErrorBanner } from '../../src/components/Banner.tsx';
import { NavSpacer } from '../../src/components/BottomNav.tsx';
import { EmptyState, LoadingState, Screen } from '../../src/components/Screen.tsx';
import { TaskRow } from '../../src/components/TaskRow.tsx';

/**
 * Tasks assigned to the signed-in member, due first with undated last. A row
 * leaves the list once the server confirms completion, because the query
 * excludes completed tasks and is invalidated by the command.
 */

export default function MyTasksScreen(): ReactNode {
  const { t, locale, client, user } = useOdin();
  const nav = useNavVisibility();
  const tasks = useMyTasksQuery(true);
  const members = useMembersQuery(true);

  const complete = useCommand(
    (
      requestId,
      input: {
        readonly taskId: string;
        readonly expectedVersion: number;
        readonly completed: boolean;
      },
    ) => setTaskCompleted(client, requestId, input),
    { invalidate: keysAffectedByTaskChange() },
  );

  if (tasks.isPending) return <LoadingState label={t('state.loading')} />;

  // Normalising first gives every row the `id` the shared due ordering needs.
  const items: readonly CrossListTaskDto[] = tasks.data?.items ?? [];
  const rows = sortTasksByDue(items.map((task) => taskRowFromCrossList(task, user?.id ?? null)));

  return (
    <Screen title={t('my_tasks.title')}>
      <ScrollView
        contentContainerStyle={styles.content}
        onScroll={nav.onScroll}
        scrollEventThrottle={16}
      >
        {complete.state.error !== null && (
          <ErrorBanner
            error={complete.state.error}
            onRetry={
              complete.state.error.code === 'NETWORK' ? () => void complete.retry() : undefined
            }
            t={t}
          />
        )}

        {rows.length === 0 ? (
          <EmptyState label={t('my_tasks.empty')} />
        ) : (
          rows.map((task) => (
            <TaskRow
              busy={complete.state.pending}
              key={task.id}
              locale={locale}
              members={members.data ?? []}
              onToggleCompleted={(selected, completed) =>
                void complete.run({
                  taskId: selected.id,
                  expectedVersion: selected.version,
                  completed,
                })
              }
              t={t}
              task={task}
            />
          ))
        )}

        <NavSpacer />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingBottom: 16 },
});
