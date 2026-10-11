import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import type { HouseholdTaskDto, MemberDto } from '@odin/contracts';
import {
  filterTasks,
  groupTasksByDeadline,
  isTaskDeadlinePreset,
  isTaskView,
  resolveTaskDeadlineFilter,
  summarizeTasks,
  TASK_DEADLINE_PRESETS,
  TASK_VIEWS,
  type TaskDeadlineFilter,
  type TaskDeadlinePreset,
  type TaskView,
} from '@odin/domain';

import { useNavVisibility } from '../../src/state/NavVisibility.tsx';
import { useOdin } from '../../src/state/OdinContext.ts';
import {
  NO_MEMBERS,
  useHomeQuery,
  useHouseholdTasksQuery,
  useMembersQuery,
} from '../../src/state/queries.ts';
import { LoadFailure } from '../../src/components/Banner.tsx';
import { Chip, Segmented, Surface, TaskGroups } from '../../src/components/Blocks.tsx';
import { NavSpacer } from '../../src/components/BottomNav.tsx';
import { SecondaryButton } from '../../src/components/Button.tsx';
import { Field } from '../../src/components/Field.tsx';
import { NewTaskFab } from '../../src/components/NewTaskEditor.tsx';
import { EmptyState, LoadingState, Screen } from '../../src/components/Screen.tsx';
import { rowFromHouseholdTask, TaskRow } from '../../src/components/TaskRow.tsx';
import { useTaskWiring } from '../../src/components/useTaskWiring.tsx';
import { useTheme } from '../../src/theme.ts';

/**
 * Tasks: whose tasks, deadline, search and done are filters over the one
 * household read. Today's tiles open it with a filter already chosen.
 */

function useInitialFilters() {
  const params = useLocalSearchParams<{ view?: string; deadline?: string; blocked?: string }>();
  const [view, setView] = useState<TaskView>(isTaskView(params.view) ? params.view : 'mine');
  const [deadline, setDeadline] = useState<TaskDeadlineFilter>({
    preset: isTaskDeadlinePreset(params.deadline) ? params.deadline : 'all',
  });
  const [blockedOnly, setBlockedOnly] = useState(params.blocked === '1');
  return { view, setView, deadline, setDeadline, blockedOnly, setBlockedOnly };
}

function RangeFields({
  onApply,
}: {
  readonly onApply: (filter: TaskDeadlineFilter) => void;
}): ReactNode {
  const { t } = useOdin();
  const theme = useTheme();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [invalid, setInvalid] = useState(false);
  return (
    <View style={styles.range}>
      <Field
        label={t('filter.date.from')}
        onChangeText={setFrom}
        placeholder="YYYY-MM-DD"
        value={from}
      />
      <Field label={t('filter.date.to')} onChangeText={setTo} placeholder="YYYY-MM-DD" value={to} />
      <SecondaryButton
        label={t('filter.date.apply')}
        onPress={() => {
          const next = { preset: 'range' as const, from, to };
          const ok = resolveTaskDeadlineFilter(next).ok;
          setInvalid(!ok);
          if (ok) onApply(next);
        }}
      />
      {invalid && (
        <Text accessibilityRole="alert" style={{ color: theme.colors.danger }}>
          {t('filter.date.invalid')}
        </Text>
      )}
    </View>
  );
}

function DeadlineChips({
  deadline,
  blockedOnly,
  onDeadline,
  onBlocked,
}: {
  readonly deadline: TaskDeadlineFilter;
  readonly blockedOnly: boolean;
  readonly onDeadline: (filter: TaskDeadlineFilter) => void;
  readonly onBlocked: (on: boolean) => void;
}): ReactNode {
  const { t } = useOdin();
  const [rangeOpen, setRangeOpen] = useState(false);
  const selected = (preset: TaskDeadlinePreset): boolean =>
    preset === 'range'
      ? rangeOpen || deadline.preset === 'range'
      : !rangeOpen && deadline.preset === preset;
  return (
    <>
      <ScrollView
        contentContainerStyle={styles.chips}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {TASK_DEADLINE_PRESETS.map((preset) => (
          <Chip
            key={preset}
            label={t(`filter.deadline.${preset}`)}
            onPress={() => {
              setRangeOpen(preset === 'range');
              if (preset !== 'range') onDeadline({ preset });
            }}
            selected={selected(preset)}
          />
        ))}
        <Chip
          label={t('tasks.blocked_only')}
          onPress={() => onBlocked(!blockedOnly)}
          selected={blockedOnly}
        />
      </ScrollView>
      {rangeOpen && <RangeFields onApply={onDeadline} />}
    </>
  );
}

function ShowDone({
  value,
  onChange,
}: {
  readonly value: boolean;
  readonly onChange: (next: boolean) => void;
}): ReactNode {
  const { t } = useOdin();
  const theme = useTheme();
  return (
    <View style={styles.toggle}>
      <Text style={{ color: theme.colors.text }}>{t('tasks.show_done')}</Text>
      <Switch
        accessibilityLabel={t('tasks.show_done')}
        onValueChange={onChange}
        thumbColor={value ? theme.colors.accent : theme.colors.surface}
        trackColor={{ false: theme.colors.border, true: theme.colors.accentSoft }}
        value={value}
      />
    </View>
  );
}

function TaskResults({
  tasks,
  members,
  now,
  wiring,
}: {
  readonly tasks: readonly HouseholdTaskDto[];
  readonly members: readonly MemberDto[];
  readonly now: Date;
  readonly wiring: ReturnType<typeof useTaskWiring>;
}): ReactNode {
  const { t, locale } = useOdin();
  if (tasks.length === 0) return <EmptyState label={t('tasks.all.empty')} />;
  return (
    <Surface>
      <TaskGroups
        groups={groupTasksByDeadline(tasks, now)}
        renderRow={(task) => (
          <TaskRow
            {...wiring.handlers}
            busy={wiring.actions.busy}
            key={task.id}
            locale={locale}
            members={members}
            t={t}
            task={rowFromHouseholdTask(task)}
          />
        )}
        t={t}
      />
    </Surface>
  );
}

export default function TasksScreen(): ReactNode {
  const { t, user } = useOdin();
  const theme = useTheme();
  const nav = useNavVisibility();
  const query = useHouseholdTasksQuery();
  const home = useHomeQuery();
  const members = useMembersQuery().data ?? NO_MEMBERS;
  const wiring = useTaskWiring({ members });
  const filters = useInitialFilters();
  const [search, setSearch] = useState('');
  const [showDone, setShowDone] = useState(false);

  if (query.isPending) return <LoadingState />;

  const now = new Date();
  const userId = user?.id ?? null;
  const items = query.data?.items ?? [];
  const counts = summarizeTasks(items, userId, now);
  const shown = filterTasks(
    items,
    {
      view: filters.view,
      userId,
      deadline: filters.deadline,
      search,
      showDone,
      blockedOnly: filters.blockedOnly,
    },
    now,
  );

  return (
    <Screen title={t('tasks.title')}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        onScroll={nav.onScroll}
        scrollEventThrottle={16}
      >
        <Segmented
          onChange={(view) => {
            filters.setView(view);
            router.setParams({ view });
          }}
          options={TASK_VIEWS.map((key: TaskView) => ({
            key,
            label: t(`tasks.view.${key}`),
            count: counts[key],
          }))}
          value={filters.view}
        />
        <TextInput
          accessibilityLabel={t('tasks.search')}
          onChangeText={setSearch}
          placeholder={t('tasks.search')}
          placeholderTextColor={theme.colors.textMuted}
          style={[
            styles.search,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.borderStrong,
              borderRadius: theme.radius.md,
              color: theme.colors.text,
              minHeight: theme.touchTarget,
            },
          ]}
          value={search}
        />
        <DeadlineChips
          blockedOnly={filters.blockedOnly}
          deadline={filters.deadline}
          onBlocked={filters.setBlockedOnly}
          onDeadline={filters.setDeadline}
        />
        {filters.view === 'everyone' && <ShowDone onChange={setShowDone} value={showDone} />}

        {query.isError && <LoadFailure onRetry={() => void query.refetch()} t={t} />}
        {wiring.errors}

        <TaskResults members={members} now={now} tasks={shown} wiring={wiring} />
        <NavSpacer />
      </ScrollView>

      <NewTaskFab lists={home.data?.items ?? []} members={members} />
      {wiring.overlays}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { gap: 8, paddingRight: 16 },
  content: { gap: 12, paddingBottom: 16 },
  range: { gap: 8 },
  search: { borderWidth: 1, fontSize: 16, paddingHorizontal: 12 },
  toggle: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
});
