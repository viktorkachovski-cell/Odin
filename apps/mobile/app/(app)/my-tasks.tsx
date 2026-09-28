import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import type { TaskRowModel } from '@odin/contracts';
import { useTaskRowActions } from '@odin/data';
import { sortTasksByDue } from '@odin/domain';

import { useNavVisibility } from '../../src/state/NavVisibility.tsx';
import { useOdin } from '../../src/state/OdinContext.ts';
import { NO_MEMBERS, useMembersQuery, useMyTasksQuery } from '../../src/state/queries.ts';
import { useEvent } from '../../src/state/useEvent.ts';
import { NavSpacer } from '../../src/components/BottomNav.tsx';
import { CommandErrors } from '../../src/components/ListDetailSections.tsx';
import { EmptyState, LoadingState, Screen } from '../../src/components/Screen.tsx';
import { rowFromHouseholdTask, TaskRow } from '../../src/components/TaskRow.tsx';
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
  const members = useMembersQuery().data ?? NO_MEMBERS;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const actions = useTaskRowActions(client);
  const open = useEvent((task: TaskRowModel) => setSelectedId(task.id));
  const setState = useEvent(actions.setState);
  const toggle = useEvent(actions.toggleCompleted);

  if (tasks.isPending) return <LoadingState />;

  const rows = sortTasksByDue((tasks.data?.items ?? []).map(rowFromHouseholdTask));

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
              members={members}
              onPress={open}
              onSetState={setState}
              onToggleCompleted={toggle}
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
