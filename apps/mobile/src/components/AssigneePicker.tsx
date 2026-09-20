import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MemberDto } from '@odin/contracts';
import type { Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';
import { Avatar } from './Avatar.tsx';

/**
 * At most one assignee, chosen from active members. Rendered as explicit
 * options rather than a native picker so the selected state is announced and
 * the unassigned choice is always visible.
 */
export function AssigneePicker({
  members,
  selected,
  onSelect,
  t,
}: {
  readonly members: readonly MemberDto[];
  readonly selected: string | null;
  readonly onSelect: (userId: string | null) => void;
  readonly t: Translator;
}): ReactNode {
  const theme = useTheme();

  const option = (userId: string | null, label: string, avatar: ReactNode): ReactNode => {
    const active = selected === userId;
    return (
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="radio"
        accessibilityState={{ selected: active }}
        key={userId ?? 'none'}
        onPress={() => onSelect(userId)}
        style={[
          styles.option,
          {
            backgroundColor: active ? theme.colors.surfaceMuted : theme.colors.surface,
            borderColor: active ? theme.colors.accent : theme.colors.border,
            borderRadius: theme.radius.pill,
            minHeight: theme.touchTarget,
          },
        ]}
      >
        {avatar}
        <Text style={{ color: theme.colors.text }}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>
        {t('task.assignee.label')}
      </Text>
      <View accessibilityRole="radiogroup" style={styles.options}>
        {option(null, t('task.assignee.none'), null)}
        {members.map((member) =>
          option(
            member.user_id,
            member.display_name,
            <Avatar displayName={member.display_name} size={24} userId={member.user_id} />,
          ),
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '500' },
  option: {
    alignItems: 'center',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  wrapper: { gap: 6 },
});
