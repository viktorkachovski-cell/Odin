import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { TaskStatus } from '@odin/contracts';
import { keysAffectedByTaskChange, setTaskCompleted, setTaskStatus, useCommand } from '@odin/data';
import { resolveTaskDeadlineFilter, sortTasksByDue, type TaskDeadlineFilter } from '@odin/domain';

import { useNavVisibility } from '../../src/state/NavVisibility.tsx';
import { useOdin } from '../../src/state/OdinContext.ts';
import { useTheme } from '../../src/theme.ts';
import { useAllTasksQuery, useMembersQuery } from '../../src/state/queries.ts';
import { ErrorBanner } from '../../src/components/Banner.tsx';
import { ActionMenu } from '../../src/components/ActionMenu.tsx';
import { NavSpacer } from '../../src/components/BottomNav.tsx';
import { Field } from '../../src/components/Field.tsx';
import { SecondaryButton } from '../../src/components/Button.tsx';
import { Screen, EmptyState, LoadingState } from '../../src/components/Screen.tsx';
import { TaskDetailsFlow } from '../../src/components/TaskDetailsFlow.tsx';
import { TaskRow } from '../../src/components/TaskRow.tsx';

const PRESETS: readonly TaskDeadlineFilter['preset'][] = [
  'all',
  'overdue',
  'today',
  'upcoming',
  'undated',
  'range',
];

export default function AllTasksScreen(): ReactNode {
  const { t, locale, client } = useOdin();
  const theme = useTheme();
  const nav = useNavVisibility();
  const members = useMembersQuery(true);
  const [filter, setFilter] = useState<TaskDeadlineFilter>({ preset: 'all' });
  const [rangeOpen, setRangeOpen] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [filterError, setFilterError] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const tasks = useAllTasksQuery(filter, true);

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
  const changeStatus = useCommand(
    (
      requestId,
      input: {
        readonly taskId: string;
        readonly expectedVersion: number;
        readonly status: TaskStatus;
      },
    ) => setTaskStatus(client, requestId, input),
    { invalidate: keysAffectedByTaskChange() },
  );

  const chooseFilter = (preset: TaskDeadlineFilter['preset']): void => {
    setFilterError(false);
    if (preset === 'range') {
      setRangeOpen(true);
      return;
    }
    setRangeOpen(false);
    setFilter({ preset });
  };

  const applyRange = (): void => {
    const next = { preset: 'range' as const, from, to };
    if (!resolveTaskDeadlineFilter(next).ok) {
      setFilterError(true);
      return;
    }
    setFilterError(false);
    setFilter(next);
  };

  if (tasks.isPending) return <LoadingState label={t('state.loading')} />;
  const rows = sortTasksByDue(
    (tasks.data?.items ?? []).map((task) => ({
      ...task,
      list_title: task.list_title,
      assignee_id: task.assignee_id,
    })),
  );

  return (
    <Screen title={t('tasks.all.title')}>
      <ScrollView
        contentContainerStyle={styles.content}
        onScroll={nav.onScroll}
        scrollEventThrottle={16}
      >
        {tasks.isError && (
          <ErrorBanner
            error={{ code: 'UNKNOWN', message_key: 'error.unknown' }}
            onRetry={() => void tasks.refetch()}
            t={t}
          />
        )}
        {complete.state.error !== null && (
          <ErrorBanner error={complete.state.error} onRetry={() => void complete.retry()} t={t} />
        )}
        {changeStatus.state.error !== null && (
          <ErrorBanner
            error={changeStatus.state.error}
            onRetry={() => void changeStatus.retry()}
            t={t}
          />
        )}

        <View style={styles.filter}>
          <ActionMenu
            accessibilityLabel={t('filter.deadline.label')}
            actions={PRESETS.map((preset) => ({
              label: t(`filter.deadline.${preset}`),
              onPress: () => chooseFilter(preset),
            }))}
          />
          <Text style={[styles.filterLabel, { color: theme.colors.text }]}>
            {t(`filter.deadline.${filter.preset}`)}
          </Text>
        </View>
        {rangeOpen && (
          <View style={styles.range}>
            <Field
              label={t('filter.date.from')}
              onChangeText={(value) => {
                setFrom(value);
                setFilterError(false);
              }}
              placeholder="YYYY-MM-DD"
              value={from}
            />
            <Field
              label={t('filter.date.to')}
              onChangeText={(value) => {
                setTo(value);
                setFilterError(false);
              }}
              placeholder="YYYY-MM-DD"
              value={to}
            />
            <SecondaryButton label={t('filter.date.apply')} onPress={applyRange} />
            {filterError && (
              <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
                {t('filter.date.invalid')}
              </Text>
            )}
          </View>
        )}

        {rows.length === 0 ? (
          <EmptyState label={t('tasks.all.empty')} />
        ) : (
          rows.map((task) => (
            <TaskRow
              busy={complete.state.pending || changeStatus.state.pending}
              key={task.id}
              locale={locale}
              members={members.data ?? []}
              onPress={(selected) => setSelectedTaskId(selected.id)}
              onSetStatus={(selected, status) =>
                void changeStatus.run({
                  taskId: selected.id,
                  expectedVersion: selected.version,
                  status,
                })
              }
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
      <TaskDetailsFlow
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
  filter: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  filterLabel: { fontSize: 16, fontWeight: '600' },
  range: { gap: 8 },
});
