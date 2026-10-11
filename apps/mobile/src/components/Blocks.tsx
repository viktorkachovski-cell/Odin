import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { progressPercent, type DeadlineGroup, type TaskGroup } from '@odin/domain';
import type { Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';

/**
 * Small building blocks the Today, Tasks and Lists screens share: a raised
 * surface, a panel header, a segmented control, filter chips, a thin progress
 * bar and deadline-grouped task sections.
 */

export function Surface({ children }: { readonly children: ReactNode }): ReactNode {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.surface,
        { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg },
      ]}
    >
      {children}
    </View>
  );
}

export function PanelHeader({
  title,
  actionLabel,
  onAction,
}: {
  readonly title: string;
  readonly actionLabel?: string | undefined;
  readonly onAction?: (() => void) | undefined;
}): ReactNode {
  const theme = useTheme();
  return (
    <View style={styles.panelHeader}>
      <Text accessibilityRole="header" style={[styles.panelTitle, { color: theme.colors.text }]}>
        {title}
      </Text>
      {actionLabel !== undefined && onAction !== undefined && (
        <Pressable
          accessibilityRole="link"
          hitSlop={4}
          onPress={onAction}
          style={[styles.panelAction, { minHeight: theme.touchTarget }]}
        >
          <Text style={[styles.panelActionText, { color: theme.colors.accent }]}>
            {actionLabel}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export interface SegmentOption<K extends string> {
  readonly key: K;
  readonly label: string;
  readonly count?: number;
}

export function Segmented<K extends string>({
  options,
  value,
  onChange,
}: {
  readonly options: readonly SegmentOption<K>[];
  readonly value: K;
  readonly onChange: (key: K) => void;
}): ReactNode {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.segmented,
        { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.md },
      ]}
    >
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={option.key}
            onPress={() => onChange(option.key)}
            style={[
              styles.segment,
              { borderRadius: theme.radius.md - 2, minHeight: theme.touchTarget - 6 },
              selected && { backgroundColor: theme.colors.surface, elevation: 1 },
            ]}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.segmentText,
                { color: theme.colors.text },
                selected && styles.segmentTextSelected,
              ]}
            >
              {option.label}
              {option.count === undefined ? '' : ` ${String(option.count)}`}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}): ReactNode {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.colors.accentSoft : theme.colors.surface,
          borderColor: selected ? theme.colors.accent : theme.colors.borderStrong,
          borderRadius: theme.radius.pill,
          minHeight: 40,
        },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          { color: selected ? theme.colors.accent : theme.colors.text },
          selected && styles.segmentTextSelected,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function ProgressBar({
  completed,
  total,
  height = 6,
}: {
  readonly completed: number;
  readonly total: number;
  readonly height?: number;
}): ReactNode {
  const theme = useTheme();
  const percent = progressPercent(completed, total);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.track,
        { backgroundColor: theme.colors.accentSoft, borderRadius: height, height },
      ]}
    >
      <View style={{ backgroundColor: theme.colors.accent, flex: percent }} />
      <View style={{ flex: 100 - percent }} />
    </View>
  );
}

const GROUP_KEYS: Record<DeadlineGroup, `tasks.group.${DeadlineGroup}`> = {
  overdue: 'tasks.group.overdue',
  today: 'tasks.group.today',
  upcoming: 'tasks.group.upcoming',
  undated: 'tasks.group.undated',
  done: 'tasks.group.done',
};

export function GroupHeading({
  label,
  danger = false,
}: {
  readonly label: string;
  readonly danger?: boolean;
}): ReactNode {
  const theme = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[
        styles.groupHeading,
        { color: danger ? theme.colors.danger : theme.colors.textMuted },
      ]}
    >
      {label.toLocaleUpperCase()}
    </Text>
  );
}

/** Deadline groups, each under a heading with its count. */
export function TaskGroups<T>({
  groups,
  t,
  renderRow,
}: {
  readonly groups: readonly TaskGroup<T>[];
  readonly t: Translator;
  readonly renderRow: (task: T) => ReactNode;
}): ReactNode {
  return (
    <>
      {groups.map(({ group, tasks }) => (
        <View key={group}>
          <GroupHeading
            danger={group === 'overdue'}
            label={`${t(GROUP_KEYS[group])} · ${String(tasks.length)}`}
          />
          {tasks.map(renderRow)}
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1, justifyContent: 'center', paddingHorizontal: 14 },
  chipText: { fontSize: 14 },
  groupHeading: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    paddingBottom: 4,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  panelAction: { justifyContent: 'center' },
  panelActionText: { fontSize: 14, fontWeight: '600' },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  panelTitle: { fontSize: 17, fontWeight: '700' },
  segment: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 8 },
  segmentText: { fontSize: 14, fontWeight: '500' },
  segmentTextSelected: { fontWeight: '700' },
  segmented: { flexDirection: 'row', gap: 2, padding: 3 },
  surface: {
    elevation: 1,
    overflow: 'hidden',
    shadowColor: '#1f1a11',
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  track: { flex: 1, flexDirection: 'row', overflow: 'hidden' },
});
