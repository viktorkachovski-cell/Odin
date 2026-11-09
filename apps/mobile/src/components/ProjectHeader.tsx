import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ProjectSummaryDto } from '@odin/contracts';
import type { Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';
import { ActionMenu } from './ActionMenu.tsx';

/**
 * The heading over one project's lists: its name, how many lists it holds, a
 * shortcut to add a list to it and a menu to rename or delete it. Pass no
 * `project` for the heading over lists that are in no project.
 */
export function ProjectHeader({
  project,
  count,
  disabled = false,
  t,
  onAddList,
  onRename,
  onDelete,
}: {
  readonly project: ProjectSummaryDto | null;
  readonly count: number;
  readonly disabled?: boolean;
  readonly t: Translator;
  readonly onAddList?: ((project: ProjectSummaryDto) => void) | undefined;
  readonly onRename?: ((project: ProjectSummaryDto) => void) | undefined;
  readonly onDelete?: ((project: ProjectSummaryDto) => void) | undefined;
}): ReactNode {
  const theme = useTheme();
  const name = project?.name ?? t('project.other_lists');
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text
          accessibilityRole="header"
          style={[
            styles.name,
            { color: project === null ? theme.colors.textMuted : theme.colors.text },
          ]}
        >
          {name}
        </Text>
        <Text style={[styles.count, { color: theme.colors.textMuted }]}>
          {t('project.list_count', { count })}
        </Text>
      </View>
      {project !== null && onAddList !== undefined && (
        <Pressable
          accessibilityLabel={t('project.add_list', { name })}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          hitSlop={4}
          onPress={() => onAddList(project)}
          style={[styles.add, { minHeight: theme.touchTarget, minWidth: theme.touchTarget }]}
        >
          <Text style={[styles.addText, { color: theme.colors.accent }]}>+</Text>
        </Pressable>
      )}
      {project !== null && onRename !== undefined && onDelete !== undefined && (
        <ActionMenu
          accessibilityLabel={`${t('project.actions')}: ${name}`}
          actions={[
            { label: t('project.rename'), onPress: () => onRename(project) },
            { label: t('project.delete'), onPress: () => onDelete(project), destructive: true },
          ]}
          disabled={disabled}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  add: { alignItems: 'center', justifyContent: 'center' },
  addText: { fontSize: 26, fontWeight: '600' },
  count: { fontSize: 13 },
  name: { fontSize: 20, fontWeight: '700' },
  row: { alignItems: 'center', flexDirection: 'row', gap: 4, marginTop: 8 },
  text: { flex: 1, gap: 2, minWidth: 0 },
});
