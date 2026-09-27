import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { taskRowFromHouseholdTask } from '@odin/contracts';
import { claimTask, keysAffectedByTaskChange, useCommand, useTaskRowActions } from '@odin/data';
import { sortTasksByDue } from '@odin/domain';

import { useNavVisibility } from '../../src/state/NavVisibility.tsx';
import { useOdin } from '../../src/state/OdinContext.ts';
import { useMembersQuery, useUnassignedQuery } from '../../src/state/queries.ts';
import { ErrorBanner } from '../../src/components/Banner.tsx';
import { NavSpacer } from '../../src/components/BottomNav.tsx';
import { CommandErrors } from '../../src/components/ListDetailSections.tsx';
import { EmptyState, LoadingState, Screen } from '../../src/components/Screen.tsx';
import { TaskRow } from '../../src/components/TaskRow.tsx';
import { TaskDetailsFlow } from '../../src/components/TaskDetailsFlow.tsx';

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
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const claim = useCommand(
    (requestId, input: { readonly taskId: string; readonly expectedVersion: number }) =>
      claimTask(client, requestId, input),
    { invalidate: keysAffectedByTaskChange() },
  );
  const actions = useTaskRowActions(client);

  if (tasks.isPending) return <LoadingState label={t('state.loading')} />;

  const rows = sortTasksByDue((tasks.data?.items ?? []).map(taskRowFromHouseholdTask));

  return (
    <Screen title={t('unassigned.title')}>
      <ScrollView
        contentContainerStyle={styles.content}
        onScroll={nav.onScroll}
        scrollEventThrottle={16}
      >
        {claim.state.error !== null && (
          <ErrorBanner
            error={claim.state.error}
            onRetry={claim.state.error.code === 'NETWORK' ? () => void claim.retry() : undefined}
            t={t}
          />
        )}
        <CommandErrors errors={actions.errors} t={t} />

        {rows.length === 0 ? (
          <EmptyState label={t('unassigned.empty')} />
        ) : (
          rows.map((task) => (
            <TaskRow
              busy={claim.state.pending || actions.busy}
              key={task.id}
              locale={locale}
              members={members.data ?? []}
              onPress={(selected) => setSelectedTaskId(selected.id)}
              onSetState={actions.setState}
              onClaim={(selected) =>
                void claim.run({ taskId: selected.id, expectedVersion: selected.version })
              }
              t={t}
              task={task}
            />
          ))
        )}

        <NavSpacer />
      </ScrollView>
      <TaskDetailsFlow
        editable
        key={selectedTaskId ?? 'closed'}
        members={members.data ?? []}
        onClose={() => setSelectedTaskId(null)}
        taskId={selectedTaskId}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingBottom: 16 },
});
