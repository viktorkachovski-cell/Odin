import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { taskRowFromHouseholdTask } from '@odin/contracts';
import { useTaskRowActions } from '@odin/data';
import { sortTasksByDue } from '@odin/domain';

import { useNavVisibility } from '../../src/state/NavVisibility.tsx';
import { useOdin } from '../../src/state/OdinContext.ts';
import { useMembersQuery, useMyTasksQuery } from '../../src/state/queries.ts';
import { NavSpacer } from '../../src/components/BottomNav.tsx';
import { CommandErrors } from '../../src/components/ListDetailSections.tsx';
import { EmptyState, LoadingState, Screen } from '../../src/components/Screen.tsx';
import { TaskRow } from '../../src/components/TaskRow.tsx';
import { TaskDetailsFlow } from '../../src/components/TaskDetailsFlow.tsx';

/**
 * Tasks assigned to the signed-in member, due first with undated last. A row
 * leaves the list once the server confirms completion, because the query
 * excludes completed tasks and is invalidated by the command.
 */

export default function MyTasksScreen(): ReactNode {
  const { t, locale, client } = useOdin();
  const nav = useNavVisibility();
  const tasks = useMyTasksQuery(true);
  const members = useMembersQuery(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const actions = useTaskRowActions(client);

  if (tasks.isPending) return <LoadingState label={t('state.loading')} />;

  const rows = sortTasksByDue((tasks.data?.items ?? []).map(taskRowFromHouseholdTask));

  return (
    <Screen title={t('my_tasks.title')}>
      <ScrollView
        contentContainerStyle={styles.content}
        onScroll={nav.onScroll}
        scrollEventThrottle={16}
      >
        <CommandErrors errors={actions.errors} t={t} />

        {rows.length === 0 ? (
          <EmptyState label={t('my_tasks.empty')} />
        ) : (
          rows.map((task) => (
            <TaskRow
              busy={actions.busy}
              key={task.id}
              locale={locale}
              members={members.data ?? []}
              onPress={(selected) => setSelectedTaskId(selected.id)}
              onSetState={actions.setState}
              onToggleCompleted={actions.toggleCompleted}
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
