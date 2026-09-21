import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MemberDto, TaskRowModel } from '@odin/contracts';
import { isOverdue } from '@odin/domain';
import type { Locale, Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';
import { ActionMenu, type ActionMenuItem } from './ActionMenu.tsx';
import { Avatar } from './Avatar.tsx';
import { SecondaryButton } from './Button.tsx';

/**
 * A task row is a flat set of sibling controls, never a pressable card with
 * buttons inside it. Completing a task and opening its editor are separate
 * targets, so completion can never open the editor by accident.
 *
 * It renders a `TaskRowModel`, so the full list-detail task and the narrower
 * My Tasks / Unassigned projection share one component.
 */

export interface TaskRowProps {
  readonly task: TaskRowModel;
  readonly members: readonly MemberDto[];
  readonly locale: Locale;
  readonly t: Translator;
  readonly busy?: boolean;
  readonly onToggleCompleted?: ((task: TaskRowModel, completed: boolean) => void) | undefined;
  readonly onEdit?: ((task: TaskRowModel) => void) | undefined;
  readonly onClaim?: ((task: TaskRowModel) => void) | undefined;
  readonly onUnassign?: ((task: TaskRowModel) => void) | undefined;
  readonly onDelete?: ((task: TaskRowModel) => void) | undefined;
}

function TaskActions({
  task,
  busy = false,
  t,
  onClaim,
  onEdit,
  onUnassign,
  onDelete,
}: Pick<
  TaskRowProps,
  'task' | 'busy' | 't' | 'onClaim' | 'onEdit' | 'onUnassign' | 'onDelete'
>): ReactNode {
  const actions: ActionMenuItem[] = [
    ...(onEdit === undefined
      ? []
      : [{ label: t('task.edit_action.short'), onPress: () => onEdit(task) }]),
    ...(onUnassign === undefined || task.assignee_id === null
      ? []
      : [{ label: t('task.unassign.short'), onPress: () => onUnassign(task) }]),
    ...(onDelete === undefined
      ? []
      : [
          {
            label: t('task.delete.short'),
            onPress: () => onDelete(task),
            destructive: true,
          },
        ]),
  ];

  return (
    <View style={styles.actions}>
      {onClaim !== undefined && (
        <SecondaryButton
          accessibilityLabel={t('task.claim', { title: task.title })}
          disabled={busy}
          label={t('task.claim.short')}
          onPress={() => onClaim(task)}
        />
      )}
      <ActionMenu
        accessibilityLabel={t('task.actions', { title: task.title })}
        actions={actions}
        disabled={busy}
      />
    </View>
  );
}

function formatDue(dueAt: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'bg' ? 'bg-BG' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(dueAt));
}

function DueText({
  task,
  locale,
  t,
}: {
  readonly task: TaskRowModel;
  readonly locale: Locale;
  readonly t: Translator;
}): ReactNode {
  const theme = useTheme();
  if (task.due_at === null) {
    return (
      <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{t('task.due.none')}</Text>
    );
  }
  const overdue = isOverdue(task);
  return (
    <Text
      style={[
        styles.meta,
        { color: overdue ? theme.colors.danger : theme.colors.textMuted },
        overdue && styles.metaStrong,
      ]}
    >
      {/* Overdue is spelled out; colour alone would not be enough. */}
      {overdue ? `${t('task.overdue')} · ` : ''}
      {formatDue(task.due_at, locale)}
    </Text>
  );
}

export function TaskRow({
  task,
  members,
  locale,
  t,
  busy = false,
  onToggleCompleted,
  onEdit,
  onClaim,
  onUnassign,
  onDelete,
}: TaskRowProps): ReactNode {
  const theme = useTheme();
  const assignee = members.find((member) => member.user_id === task.assignee_id);

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      {onToggleCompleted !== undefined && (
        <Pressable
          accessibilityLabel={
            task.completed
              ? t('task.incomplete', { title: task.title })
              : t('task.complete', { title: task.title })
          }
          accessibilityRole="checkbox"
          accessibilityState={{ checked: task.completed, disabled: busy }}
          disabled={busy}
          hitSlop={8}
          onPress={() => onToggleCompleted(task, !task.completed)}
          style={[styles.toggle, { minHeight: theme.touchTarget, minWidth: theme.touchTarget }]}
        >
          <Text style={[styles.box, { color: theme.colors.text }]}>
            {task.completed ? '☑' : '☐'}
          </Text>
        </Pressable>
      )}

      <View style={styles.body}>
        <Text
          style={[styles.title, { color: theme.colors.text }, task.completed && styles.titleDone]}
        >
          {task.title}
        </Text>
        {task.notes !== undefined && task.notes !== null && (
          <Text numberOfLines={2} style={[styles.meta, { color: theme.colors.textMuted }]}>
            {task.notes}
          </Text>
        )}

        <View style={styles.metaRow}>
          {task.list_title !== undefined && (
            <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
              {t('task.in_list', { list: task.list_title })}
            </Text>
          )}

          {assignee === undefined ? (
            <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
              {t('task.assignee.unassigned')}
            </Text>
          ) : (
            <View style={styles.chip}>
              <Avatar displayName={assignee.display_name} size={22} userId={assignee.user_id} />
              <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
                {assignee.display_name}
              </Text>
            </View>
          )}

          <DueText locale={locale} t={t} task={task} />
        </View>
      </View>

      <TaskActions
        busy={busy}
        onClaim={onClaim}
        onDelete={onDelete}
        onEdit={onEdit}
        onUnassign={onUnassign}
        t={t}
        task={task}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  body: { flexShrink: 1, gap: 4, minWidth: 0 },
  box: { fontSize: 22 },
  chip: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  meta: { fontSize: 13 },
  metaRow: {
    alignItems: 'center',
    columnGap: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 4,
  },
  metaStrong: { fontWeight: '700' },
  row: {
    alignItems: 'flex-start',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  title: { flexShrink: 1, fontSize: 16, fontWeight: '500' },
  titleDone: { textDecorationLine: 'line-through' },
  toggle: { alignItems: 'center', justifyContent: 'center' },
});
