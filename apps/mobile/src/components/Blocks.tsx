import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { MOVE_DIRECTIONS, type MoveDirection } from '@odin/contracts';
import { progressPercent, type TaskGroup } from '@odin/domain';
import type { Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';

/**
 * Small building blocks the Today, Tasks and Lists screens share: a raised
 * surface, a panel header, a segmented control, chips, move controls, a thin
 * progress bar and deadline-grouped task sections.
 */

export function Surface({ children }: { readonly children: ReactNode }): ReactNode {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.surface,
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          borderColor: theme.colors.border,
        },
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

interface SegmentOption<K extends string> {
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
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 400 && fontScale > 1.25;
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.segmented,
        stacked && styles.segmentsStacked,
        { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radius.md },
      ]}
    >
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            accessibilityLabel={
              option.count === undefined ? option.label : `${option.label}, ${String(option.count)}`
            }
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={option.key}
            onPress={() => onChange(option.key)}
            style={[
              styles.segment,
              { borderRadius: theme.radius.md - 2, minHeight: theme.touchTarget },
              stacked && styles.segmentStacked,
              selected && { backgroundColor: theme.colors.surface, elevation: 1 },
            ]}
          >
            <Text
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

/** 40dp tall; the hit slop brings the target to 48dp. */
export function Chip({
  label,
  selected,
  onPress,
  role = 'button',
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly role?: 'button' | 'radio';
}): ReactNode {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityState={{ selected }}
      hitSlop={4}
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

/** Up and down, for a task or a list in reorder mode. */
export function MoveButtons({
  label,
  onMove,
  upDisabled,
  downDisabled,
}: {
  readonly label: (direction: MoveDirection) => string;
  readonly onMove: (direction: MoveDirection) => void;
  readonly upDisabled: boolean;
  readonly downDisabled: boolean;
}): ReactNode {
  const theme = useTheme();
  return (
    <View style={styles.moves}>
      {MOVE_DIRECTIONS.map((direction) => {
        const disabled = direction === 'up' ? upDisabled : downDisabled;
        return (
          <Pressable
            accessibilityLabel={label(direction)}
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            disabled={disabled}
            hitSlop={4}
            key={direction}
            onPress={() => onMove(direction)}
            style={[styles.move, { minHeight: theme.touchTarget, minWidth: theme.touchTarget }]}
          >
            <Text
              style={[
                styles.moveGlyph,
                { color: disabled ? theme.colors.disabledText : theme.colors.text },
              ]}
            >
              {direction === 'up' ? '↑' : '↓'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function GroupHeading({
  label,
  danger = false,
  inset = true,
}: {
  readonly label: string;
  readonly danger?: boolean;
  readonly inset?: boolean;
}): ReactNode {
  const theme = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[
        styles.groupHeading,
        !inset && { paddingHorizontal: 0 },
        { color: danger ? theme.colors.danger : theme.colors.textMuted },
      ]}
    >
      {label}
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
            inset={false}
            danger={group === 'overdue'}
            label={`${t(`tasks.group.${group}`)} · ${String(tasks.length)}`}
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
  move: { alignItems: 'center', justifyContent: 'center' },
  moveGlyph: { fontSize: 18, fontWeight: '700' },
  moves: { flexDirection: 'row' },
  groupHeading: {
    fontSize: 12,
    fontWeight: '700',
    paddingBottom: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  panelAction: { justifyContent: 'center' },
  panelActionText: { fontSize: 14, fontWeight: '600' },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 0,
    paddingTop: 6,
  },
  panelTitle: { flex: 1, fontSize: 20, fontWeight: '700' },
  segment: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 8 },
  segmentText: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '500',
    maxWidth: '100%',
    textAlign: 'center',
  },
  segmentsStacked: { flexDirection: 'column' },
  segmentStacked: { flex: 0, paddingVertical: 8 },
  segmentTextSelected: { fontWeight: '700' },
  segmented: { flexDirection: 'row', gap: 2, padding: 3 },
  surface: {
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 1,
    overflow: 'hidden',
    shadowColor: '#1f1a11',
    shadowOffset: { height: 1, width: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  track: { flex: 1, flexDirection: 'row', overflow: 'hidden' },
});
