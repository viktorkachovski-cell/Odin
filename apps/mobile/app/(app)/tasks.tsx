import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { HouseholdTaskDto, MemberDto } from '@odin/contracts';
import {
  filterTasks,
  groupTasksByDeadline,
  isTaskDeadlinePreset,
  isTaskView,
  summarizeTasks,
  TASK_VIEWS,
  type TaskView,
} from '@odin/domain';

import { useOdin } from '../../src/state/OdinContext.ts';
import {
  NO_MEMBERS,
  useHomeQuery,
  useHouseholdTasksQuery,
  useMembersQuery,
} from '../../src/state/queries.ts';
import { LoadFailure } from '../../src/components/Banner.tsx';
import { Segmented, TaskGroups } from '../../src/components/Blocks.tsx';
import { NavSpacer } from '../../src/components/BottomNav.tsx';
import { SecondaryButton } from '../../src/components/Button.tsx';
import { NewTaskFab } from '../../src/components/NewTaskEditor.tsx';
import { EmptyState, LoadingState } from '../../src/components/Screen.tsx';
import { HouseholdScreen } from '../../src/components/HouseholdScreen.tsx';
import {
  DEFAULT_TASK_FILTERS,
  TaskFilters,
  type TaskFilterSelection,
} from '../../src/components/TaskFilters.tsx';
import { rowFromHouseholdTask, TaskRow } from '../../src/components/TaskRow.tsx';
import { useTaskWiring } from '../../src/components/useTaskWiring.tsx';
import { useTheme } from '../../src/theme.ts';

/** Today's tiles and legacy routes supply initial filters; new links also update a mounted register. */
function hasActiveFilters(filters: TaskFilterSelection, view: TaskView): boolean {
  return (
    filters.deadline.preset !== 'all' ||
    filters.blockedOnly ||
    (view === 'everyone' && filters.showDone)
  );
}

function useFilters() {
  const params = useLocalSearchParams<{ view?: string; deadline?: string; blocked?: string }>();
  const [view, setView] = useState<TaskView>(isTaskView(params.view) ? params.view : 'mine');
  const [filters, setFilters] = useState<TaskFilterSelection>(() => ({
    deadline: { preset: isTaskDeadlinePreset(params.deadline) ? params.deadline : 'all' },
    blockedOnly: params.blocked === '1',
    showDone: false,
  }));
  useEffect(() => {
    setView(isTaskView(params.view) ? params.view : 'mine');
    setFilters({
      deadline: { preset: isTaskDeadlinePreset(params.deadline) ? params.deadline : 'all' },
      blockedOnly: params.blocked === '1',
      showDone: false,
    });
  }, [params.view, params.deadline, params.blocked]);
  return { view, setView, filters, setFilters };
}

function TaskResults({
  tasks,
  members,
  now,
  wiring,
  currentUserId,
}: {
  readonly tasks: readonly HouseholdTaskDto[];
  readonly members: readonly MemberDto[];
  readonly now: Date;
  readonly wiring: ReturnType<typeof useTaskWiring>;
  readonly currentUserId: string | undefined;
}): ReactNode {
  const { t, locale } = useOdin();
  if (tasks.length === 0) return <EmptyState label={t('tasks.all.empty')} />;
  return (
    <View>
      <TaskGroups
        groups={groupTasksByDeadline(tasks, now)}
        t={t}
        renderRow={(task) => (
          <TaskRow
            {...wiring.handlers}
            busy={wiring.actions.busy}
            currentUserId={currentUserId}
            key={task.id}
            locale={locale}
            members={members}
            t={t}
            task={rowFromHouseholdTask(task)}
          />
        )}
      />
    </View>
  );
}

export default function TasksScreen(): ReactNode {
  const { t, user } = useOdin();
  const theme = useTheme();
  const query = useHouseholdTasksQuery();
  const home = useHomeQuery();
  const members = useMembersQuery().data ?? NO_MEMBERS;
  const wiring = useTaskWiring({ members });
  const { view, setView, filters, setFilters } = useFilters();
  const [search, setSearch] = useState('');
  const [filterSheet, setFilterSheet] = useState(false);
  if (query.isPending) return <LoadingState />;

  const now = new Date();
  const userId = user?.id ?? null;
  const items = query.data?.items ?? [];
  const counts = summarizeTasks(items, userId, now);
  const shown = filterTasks(items, { view, userId, ...filters, search }, now);
  const activeFilters = hasActiveFilters(filters, view);
  return (
    <HouseholdScreen title={t('tasks.title')}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Segmented
          options={TASK_VIEWS.map((key) => ({
            key,
            label: t(`tasks.view.${key}`),
            count: counts[key],
          }))}
          value={view}
          onChange={setView}
        />
        <View style={styles.searchRow}>
          <TextInput
            accessibilityLabel={t('tasks.search')}
            onChangeText={setSearch}
            value={search}
            placeholder={t('tasks.search')}
            placeholderTextColor={theme.colors.textMuted}
            style={[
              styles.search,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.borderStrong,
                borderRadius: theme.radius.md,
                color: theme.colors.text,
              },
            ]}
          />
          <SecondaryButton
            label={activeFilters ? `${t('tasks.filters')} ·` : t('tasks.filters')}
            accessibilityLabel={t('tasks.filters')}
            onPress={() => setFilterSheet(true)}
          />
        </View>
        <View style={styles.results}>
          <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.textMuted }}>
            {t('tasks.results', { count: shown.length })}
          </Text>
          {activeFilters && (
            <SecondaryButton
              label={t('tasks.filters.clear')}
              onPress={() => setFilters(DEFAULT_TASK_FILTERS)}
            />
          )}
        </View>
        {query.isError && <LoadFailure onRetry={() => void query.refetch()} t={t} />}
        {wiring.errors}
        <TaskResults
          currentUserId={user?.id}
          members={members}
          now={now}
          tasks={shown}
          wiring={wiring}
        />
        <NavSpacer />
      </ScrollView>
      <NewTaskFab lists={home.data?.items ?? []} members={members} />
      {filterSheet && (
        <TaskFilters
          value={filters}
          view={view}
          t={t}
          onApply={setFilters}
          onClose={() => setFilterSheet(false)}
        />
      )}
      {wiring.overlays}
    </HouseholdScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 12, paddingBottom: 16 },
  results: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  search: {
    borderWidth: 1,
    flex: 1,
    fontSize: 16,
    minHeight: 48,
    minWidth: 0,
    paddingHorizontal: 12,
  },
  searchRow: { flexDirection: 'row', gap: 8 },
});
