import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import type { HouseholdTaskDto, MemberDto } from '@odin/contracts';
import {
  filterTasks,
  groupMyTasksForToday,
  sortTasksByDue,
  summarizeTasks,
  type TaskSummary,
} from '@odin/domain';
import { formatDueShort, formatLongDate, type Translator } from '@odin/i18n';

import { useOdin } from '../../src/state/OdinContext.ts';
import {
  NO_MEMBERS,
  useHomeQuery,
  useHouseholdTasksQuery,
  useMembersQuery,
} from '../../src/state/queries.ts';
import { LoadFailure } from '../../src/components/Banner.tsx';
import { PanelHeader, ProgressBar, TaskGroups } from '../../src/components/Blocks.tsx';
import { NavSpacer } from '../../src/components/BottomNav.tsx';
import { AccentButton } from '../../src/components/Button.tsx';
import { NewTaskFab } from '../../src/components/NewTaskEditor.tsx';
import { EmptyState, LoadingState } from '../../src/components/Screen.tsx';
import { HouseholdScreen } from '../../src/components/HouseholdScreen.tsx';
import { rowFromHouseholdTask, TaskRow } from '../../src/components/TaskRow.tsx';
import { useTaskWiring } from '../../src/components/useTaskWiring.tsx';
import { useTheme } from '../../src/theme.ts';

/**
 * Today: four counts that open the matching Tasks filter, the member's own work
 * by deadline, a few unclaimed tasks and list progress, all from the household
 * read the Tasks screen also uses.
 */

const GRAB_LIMIT = 3;
const LIST_LIMIT = 5;

function Tiles({
  t,
  summary,
}: {
  readonly t: Translator;
  readonly summary: TaskSummary;
}): ReactNode {
  const theme = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const tiles = [
    {
      key: 'overdue',
      label: t('today.tile.overdue'),
      value: summary.overdue,
      href: '/tasks?view=everyone&deadline=overdue',
      color: theme.colors.danger,
    },
    {
      key: 'today',
      label: t('today.tile.due_today'),
      value: summary.dueToday,
      href: '/tasks?view=everyone&deadline=today',
      color: theme.colors.text,
    },
    {
      key: 'unassigned',
      label: t('today.tile.unassigned'),
      value: summary.unassigned,
      href: '/tasks?view=unassigned',
      color: theme.colors.text,
    },
    {
      key: 'blocked',
      label: t('today.tile.blocked'),
      value: summary.blocked,
      href: '/tasks?view=everyone&blocked=1',
      color: theme.colors.warning,
    },
  ] as const;
  return (
    <View style={styles.tiles}>
      {tiles.map((tile) => (
        <Pressable
          accessibilityLabel={`${tile.label}: ${String(tile.value)}`}
          accessibilityRole="link"
          key={tile.key}
          onPress={() => router.navigate(tile.href)}
          style={[
            styles.tile,
            (width < 360 || fontScale > 1.25) && styles.tileStacked,
            {
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.md,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text
            style={[styles.tileValue, { color: tile.value > 0 ? tile.color : theme.colors.text }]}
          >
            {tile.value}
          </Text>
          <Text style={[styles.tileLabel, { color: theme.colors.textMuted }]}>{tile.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function UpForGrabs({
  tasks,
  t,
  busy,
  onClaim,
}: {
  readonly tasks: readonly HouseholdTaskDto[];
  readonly t: Translator;
  readonly busy: boolean;
  readonly onClaim: (task: HouseholdTaskDto) => void;
}): ReactNode {
  const theme = useTheme();
  const { locale } = useOdin();
  return (
    <View>
      <PanelHeader
        actionLabel={tasks.length > 0 ? t('today.grabs.all', { count: tasks.length }) : undefined}
        onAction={() => router.navigate('/tasks?view=unassigned')}
        title={t('today.grabs.heading')}
      />
      {tasks.length === 0 ? (
        <Text style={[styles.panelEmpty, { color: theme.colors.textMuted }]}>
          {t('unassigned.empty')}
        </Text>
      ) : (
        tasks.slice(0, GRAB_LIMIT).map((task) => (
          <View
            key={task.id}
            style={[
              styles.grabRow,
              { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
            ]}
          >
            <View style={styles.grabText}>
              <Text style={[styles.grabTitle, { color: theme.colors.text }]}>{task.title}</Text>
              <Text style={[styles.grabMeta, { color: theme.colors.textMuted }]}>
                {task.due_at === null
                  ? task.list_title
                  : `${task.list_title} · ${formatDueShort(task.due_at, locale)}`}
              </Text>
            </View>
            <AccentButton
              accessibilityLabel={t('task.claim', { title: task.title })}
              disabled={busy}
              label={t('task.claim.short')}
              onPress={() => onClaim(task)}
            />
          </View>
        ))
      )}
    </View>
  );
}

function ListsPanel({ t }: { readonly t: Translator }): ReactNode {
  const theme = useTheme();
  const home = useHomeQuery();
  const active = (home.data?.items ?? []).filter((item) => item.kind === 'active');
  return (
    <View>
      <PanelHeader
        actionLabel={t('today.lists.all')}
        onAction={() => router.navigate('/lists')}
        title={t('today.lists.heading')}
      />
      {active.length === 0 ? (
        <Text style={[styles.panelEmpty, { color: theme.colors.textMuted }]}>
          {t('home.active.empty')}
        </Text>
      ) : (
        active.slice(0, LIST_LIMIT).map((list) => (
          <Pressable
            accessibilityRole="link"
            key={list.id}
            onPress={() => router.push({ pathname: '/list/[id]', params: { id: list.id } })}
            style={[
              styles.listRow,
              { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
            ]}
          >
            <View style={styles.listLine}>
              <Text style={[styles.listTitle, { color: theme.colors.text }]}>{list.title}</Text>
              <Text style={{ color: theme.colors.textMuted }}>
                {t('lists.progress.short', {
                  completed: list.completed_tasks,
                  total: list.total_tasks,
                })}
              </Text>
            </View>
            {list.subtitle !== null && (
              <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>{list.subtitle}</Text>
            )}
            <ProgressBar completed={list.completed_tasks} total={list.total_tasks} />
          </Pressable>
        ))
      )}
    </View>
  );
}

function MyTasksPanel({
  items,
  members,
  now,
  userId,
  wiring,
}: {
  readonly items: readonly HouseholdTaskDto[];
  readonly members: readonly MemberDto[];
  readonly now: Date;
  readonly userId: string | null;
  readonly wiring: ReturnType<typeof useTaskWiring>;
}): ReactNode {
  const { t, locale } = useOdin();
  const theme = useTheme();
  const mine = groupMyTasksForToday(items, userId, now);
  return (
    <View>
      <PanelHeader
        actionLabel={t('today.view_all')}
        onAction={() => router.navigate('/tasks?view=mine')}
        title={t('today.mine.heading')}
      />
      {mine.total === 0 ? (
        <EmptyState label={t('today.mine.empty')} />
      ) : (
        <TaskGroups
          groups={mine.groups}
          renderRow={(task) => (
            <TaskRow
              {...wiring.handlers}
              busy={wiring.actions.busy}
              key={task.id}
              locale={locale}
              members={members}
              showAssignee={false}
              t={t}
              task={rowFromHouseholdTask(task)}
            />
          )}
          t={t}
        />
      )}
      {mine.undated > 0 && (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.navigate('/tasks?view=mine&deadline=undated')}
          style={[styles.more, { borderTopColor: theme.colors.border }]}
        >
          <Text style={[styles.moreText, { color: theme.colors.accent }]}>
            {t('today.mine.undated_more', { count: mine.undated })}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export default function TodayScreen(): ReactNode {
  const { t, locale, user } = useOdin();
  const query = useHouseholdTasksQuery();
  const home = useHomeQuery();
  const members = useMembersQuery().data ?? NO_MEMBERS;
  const wiring = useTaskWiring({ members });

  if (query.isPending) return <LoadingState />;

  const now = new Date();
  const items = query.data?.items ?? [];
  const userId = user?.id ?? null;
  const unassigned = sortTasksByDue(filterTasks(items, { view: 'unassigned', userId }, now));

  return (
    <HouseholdScreen title={t('today.title')} subtitle={formatLongDate(now, locale)}>
      <ScrollView contentContainerStyle={styles.content}>
        {query.isError && <LoadFailure onRetry={() => void query.refetch()} t={t} />}
        {wiring.errors}

        <Tiles summary={summarizeTasks(items, userId, now)} t={t} />

        <MyTasksPanel items={items} members={members} now={now} userId={userId} wiring={wiring} />

        <UpForGrabs
          busy={wiring.actions.busy}
          onClaim={(task) => wiring.handlers.onClaim(rowFromHouseholdTask(task))}
          t={t}
          tasks={unassigned}
        />
        <ListsPanel t={t} />

        <NavSpacer />
      </ScrollView>

      <NewTaskFab lists={home.data?.items ?? []} members={members} />
      {wiring.overlays}
    </HouseholdScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingBottom: 16 },
  grabMeta: { fontSize: 13 },
  grabRow: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    marginBottom: 8,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  grabText: { flex: 1, minWidth: 0 },
  grabTitle: { fontSize: 16, fontWeight: '500' },
  listLine: { flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  listRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    marginBottom: 8,
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  listTitle: { flex: 1, fontSize: 15, fontWeight: '500' },
  more: {
    borderTopWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  moreText: { fontSize: 14, fontWeight: '600' },
  panelEmpty: { fontSize: 14, paddingBottom: 16, paddingHorizontal: 16 },
  tile: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 64,
    padding: 12,
  },
  tileStacked: { alignItems: 'flex-start', flexDirection: 'column', gap: 4 },
  tileLabel: { flexShrink: 1, fontSize: 13 },
  tileValue: { fontSize: 26, fontWeight: '700' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
