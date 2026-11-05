import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MAX_TASK_ASSIGNEES, type MemberDto } from '@odin/contracts';
import {
  assigneeEntries,
  canonicalAssigneeIds,
  memberLabels,
  withAssignee,
  withoutAssignee,
} from '@odin/domain';
import type { Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';
import { Avatar } from './Avatar.tsx';

/**
 * Who a task is assigned to, as a set. Each active member is a checkbox row of
 * full width, so a long name wraps instead of being cut and a large font only
 * makes the rows taller. The selected names are written out above the list,
 * with the member's own shortcuts (Assign to me, Remove me) and Clear all.
 *
 * The picker edits a draft only; the editor sends the whole set on save.
 */
export function AssigneePicker({
  members,
  selected,
  currentUserId,
  onChange,
  t,
}: {
  readonly members: readonly MemberDto[];
  readonly selected: readonly string[];
  readonly currentUserId: string | null;
  readonly onChange: (ids: readonly string[]) => void;
  readonly t: Translator;
}): ReactNode {
  const theme = useTheme();
  const labels = memberLabels(members);
  const chosen = canonicalAssigneeIds(selected);
  const full = chosen.length >= MAX_TASK_ASSIGNEES;
  const mine = currentUserId !== null && chosen.includes(currentUserId);
  const canAssignMe =
    currentUserId !== null && !mine && members.some((member) => member.user_id === currentUserId);

  const nameOf = (userId: string, name: string): string =>
    userId === currentUserId ? t('task.assignee.name_you', { name }) : name;
  const summary = assigneeEntries(chosen, members, currentUserId)
    .map((entry) => (entry.former ? t('task.assignee.former') : nameOf(entry.userId, entry.name)))
    .join(', ');

  const shortcut = (label: string, onPress: () => void, disabled = false): ReactNode => (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      key={label}
      onPress={onPress}
      style={[
        styles.shortcut,
        {
          borderColor: theme.colors.border,
          borderRadius: theme.radius.pill,
          minHeight: theme.touchTarget,
          opacity: disabled ? 0.6 : 1,
        },
      ]}
    >
      <Text style={{ color: theme.colors.text }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>
        {t('task.assignee.label')}
      </Text>
      <Text
        accessibilityLiveRegion="polite"
        accessibilityLabel={
          chosen.length === 0
            ? t('task.assignee.none')
            : `${t('task.assignee.selected', { count: chosen.length })}: ${summary}`
        }
        style={{ color: theme.colors.text }}
        testID="assignee-summary"
      >
        {chosen.length === 0 ? t('task.assignee.none') : summary}
      </Text>
      <View style={styles.shortcuts}>
        {canAssignMe &&
          currentUserId !== null &&
          shortcut(
            t('task.assignee.assign_me'),
            () => onChange(withAssignee(chosen, currentUserId)),
            full,
          )}
        {mine &&
          currentUserId !== null &&
          shortcut(t('task.assignee.remove_me'), () =>
            onChange(withoutAssignee(chosen, currentUserId)),
          )}
        {chosen.length > 0 && shortcut(t('task.assignee.clear'), () => onChange([]))}
      </View>
      <View style={styles.list}>
        {chosen
          .filter((userId) => !members.some((member) => member.user_id === userId))
          .map((userId) => (
            // Someone assigned who has since left: shown so the member can
            // take them off, which the server requires before it saves.
            <Pressable
              accessibilityLabel={t('task.assignee.former')}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: true }}
              key={userId}
              onPress={() => onChange(withoutAssignee(chosen, userId))}
              style={[
                styles.option,
                {
                  backgroundColor: theme.colors.surfaceMuted,
                  borderColor: theme.colors.accent,
                  borderRadius: theme.radius.md,
                  minHeight: theme.touchTarget,
                },
              ]}
            >
              <View
                style={[
                  styles.box,
                  { backgroundColor: theme.colors.accentSoft, borderColor: theme.colors.accent },
                ]}
              >
                <Text style={[styles.check, { color: theme.colors.accent }]}>✓</Text>
              </View>
              <Text style={[styles.name, { color: theme.colors.text }]}>
                {t('task.assignee.former')}
              </Text>
            </Pressable>
          ))}
        {members.map((member) => {
          const checked = chosen.includes(member.user_id);
          const disabled = full && !checked;
          const name = nameOf(member.user_id, labels.get(member.user_id) ?? member.display_name);
          return (
            <Pressable
              accessibilityLabel={name}
              accessibilityRole="checkbox"
              accessibilityState={{ checked, disabled }}
              disabled={disabled}
              key={member.user_id}
              onPress={() =>
                onChange(
                  checked
                    ? withoutAssignee(chosen, member.user_id)
                    : withAssignee(chosen, member.user_id),
                )
              }
              style={[
                styles.option,
                {
                  backgroundColor: checked ? theme.colors.surfaceMuted : theme.colors.surface,
                  borderColor: checked ? theme.colors.accent : theme.colors.border,
                  borderRadius: theme.radius.md,
                  minHeight: theme.touchTarget,
                  opacity: disabled ? 0.6 : 1,
                },
              ]}
            >
              <View
                style={[
                  styles.box,
                  {
                    backgroundColor: checked ? theme.colors.accentSoft : theme.colors.surface,
                    borderColor: checked ? theme.colors.accent : theme.colors.borderStrong,
                  },
                ]}
              >
                {checked && <Text style={[styles.check, { color: theme.colors.accent }]}>✓</Text>}
              </View>
              <Avatar
                displayName={member.display_name}
                members={members}
                size={24}
                userId={member.user_id}
              />
              <Text style={[styles.name, { color: theme.colors.text }]}>{name}</Text>
            </Pressable>
          );
        })}
      </View>
      {full && (
        <Text style={{ color: theme.colors.danger }}>
          {t('task.assignee.limit', { count: MAX_TASK_ASSIGNEES })}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1.5,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  check: { fontSize: 14, fontWeight: '700', lineHeight: 16 },
  label: { fontSize: 14, fontWeight: '500' },
  list: { gap: 8 },
  name: { flex: 1, flexShrink: 1, fontSize: 16 },
  option: {
    alignItems: 'center',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  shortcut: {
    alignItems: 'center',
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  wrapper: { gap: 8 },
});
