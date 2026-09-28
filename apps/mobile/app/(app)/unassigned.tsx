import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import type { TaskRowModel } from '@odin/contracts';
import { claimTask, keysAffectedByTaskChange, useCommand, useTaskRowActions } from '@odin/data';
import { sortTasksByDue } from '@odin/domain';

import { useNavVisibility } from '../../src/state/NavVisibility.tsx';
import { useOdin } from '../../src/state/OdinContext.ts';
import { NO_MEMBERS, useMembersQuery, useUnassignedQuery } from '../../src/state/queries.ts';
import { useEvent } from '../../src/state/useEvent.ts';
import { ErrorBanner } from '../../src/components/Banner.tsx';
import { NavSpacer } from '../../src/components/BottomNav.tsx';
import { CommandErrors } from '../../src/components/ListDetailSections.tsx';
import { EmptyState, LoadingState, Screen } from '../../src/components/Screen.tsx';
import { rowFromHouseholdTask, TaskRow } from '../../src/components/TaskRow.tsx';
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
  const members = useMembersQuery().data ?? NO_MEMBERS;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const claim = useCommand(
    (requestId, input: { readonly taskId: string; readonly expectedVersion: number }) =>
      claimTask(client, requestId, input),
    { invalidate: keysAffectedByTaskChange() },
  );
  const actions = useTaskRowActions(client);
  const open = useEvent((task: TaskRowModel) => setSelectedId(task.id));
  const setState = useEvent(actions.setState);
  const onClaim = useEvent(
    (task: TaskRowModel) => void claim.run({ taskId: task.id, expectedVersion: task.version }),
  );

  if (tasks.isPending) return <LoadingState />;

  const rows = sortTasksByDue((tasks.data?.items ?? []).map(rowFromHouseholdTask));

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
              members={members}
              onClaim={onClaim}
              onPress={open}
              onSetState={setState}
              t={t}
              task={task}
            />
          ))
        )}

        <NavSpacer />
      </ScrollView>
      <TaskDetailsFlow
        editable
        key={selectedId ?? 'closed'}
        members={members}
        onClose={() => setSelectedId(null)}
        taskId={selectedId}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingBottom: 16 },
});
