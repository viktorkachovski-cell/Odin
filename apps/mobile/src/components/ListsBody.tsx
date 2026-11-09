import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ListSummaryDto, ProjectSummaryDto } from '@odin/contracts';
import { groupListsByProject } from '@odin/domain';
import type { Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';
import { ProjectHeader } from './ProjectHeader.tsx';
import { EmptyState } from './Screen.tsx';

export type ListsTab = 'active' | 'templates';

/** New project (active tab only) and the reorder switch, above the lists. */
export function ListsToolbar({
  tab,
  reorderable,
  reordering,
  busy,
  t,
  onNewProject,
  onToggleReorder,
}: {
  readonly tab: ListsTab;
  readonly reorderable: boolean;
  readonly reordering: boolean;
  readonly busy: boolean;
  readonly t: Translator;
  readonly onNewProject: () => void;
  readonly onToggleReorder: () => void;
}): ReactNode {
  const theme = useTheme();
  return (
    <View style={styles.toolbar}>
      {tab === 'active' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onNewProject}
          style={[styles.button, { minHeight: theme.touchTarget }]}
        >
          <Text style={[styles.text, { color: theme.colors.accent }]}>{t('project.new')}</Text>
        </Pressable>
      ) : (
        <View />
      )}
      {reorderable && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: reordering }}
          onPress={onToggleReorder}
          style={[styles.button, { minHeight: theme.touchTarget }]}
        >
          <Text style={[styles.text, { color: theme.colors.accent }]}>
            {reordering ? t('lists.reorder.done') : t('lists.reorder')}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * The lists under the toolbar: one group per project once the household has a
 * project (Active tab only), otherwise the plain cards or the empty message.
 */
export function ListsBody({
  tab,
  active,
  shown,
  projects,
  renderCards,
  busy,
  t,
  onAddList,
  onRename,
  onDelete,
}: {
  readonly tab: ListsTab;
  readonly active: readonly ListSummaryDto[];
  readonly shown: readonly ListSummaryDto[];
  readonly projects: readonly ProjectSummaryDto[];
  readonly renderCards: (lists: readonly ListSummaryDto[]) => ReactNode;
  readonly busy: boolean;
  readonly t: Translator;
  readonly onAddList: (project: ProjectSummaryDto) => void;
  readonly onRename: (project: ProjectSummaryDto) => void;
  readonly onDelete: (project: ProjectSummaryDto) => void;
}): ReactNode {
  if (tab === 'active' && projects.length > 0) {
    const grouping = groupListsByProject(active, projects);
    return (
      <>
        {grouping.groups.map(({ project, lists }) => (
          <View key={project.id} style={styles.group}>
            <ProjectHeader
              count={lists.length}
              disabled={busy}
              onAddList={onAddList}
              onDelete={onDelete}
              onRename={onRename}
              project={project}
              t={t}
            />
            {lists.length === 0 ? <EmptyState label={t('project.empty')} /> : renderCards(lists)}
          </View>
        ))}
        {grouping.ungrouped.length > 0 && (
          <View style={styles.group}>
            <ProjectHeader count={grouping.ungrouped.length} project={null} t={t} />
            {renderCards(grouping.ungrouped)}
          </View>
        )}
      </>
    );
  }
  if (shown.length === 0) {
    return (
      <EmptyState
        label={tab === 'templates' ? t('lists.templates.empty') : t('home.active.empty')}
      />
    );
  }
  return renderCards(shown);
}

const styles = StyleSheet.create({
  button: { justifyContent: 'center', paddingHorizontal: 4 },
  group: { gap: 8 },
  text: { fontSize: 15, fontWeight: '600' },
  toolbar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: -8,
  },
});
