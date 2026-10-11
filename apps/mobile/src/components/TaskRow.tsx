import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  taskRowFromHouseholdTask,
  taskRowFromTask,
  type HouseholdTaskDto,
  type MemberDto,
  type MoveDirection,
  type TaskDto,
  type TaskRowModel,
  type TaskState,
} from '@odin/contracts';
import { isOverdue } from '@odin/domain';
import { formatDueShort, type Locale, type Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';
import { ActionMenu, type ActionMenuItem } from './ActionMenu.tsx';
import { Avatar } from './Avatar.tsx';

/**
 * A task row: completion, the task, who has it, and one overflow menu. It
 * shows exceptions rather than defaults -- a status label only when Blocked, no
 * "No deadline" text, and Claim instead of an "Unassigned" label wherever
 * claiming is offered. Completing a task and opening it are separate targets,
 * so completion can never open the task by accident. Move controls appear only
 * in reorder mode.
 *
 * It renders a `TaskRowModel`, so the full list-detail task and the household
 * projection share one component.
 */

/**
 * Row models keyed by the task object the query cache hands out. A refetch
 * keeps an unchanged task's object, so its model -- and its memoized row --
 * survive, and only the rows that changed render again.
 */
function cached<T extends object>(toRow: (task: T) => TaskRowModel): (task: T) => TaskRowModel {
  const rows = new WeakMap<T, TaskRowModel>();
  return (task) => {
    let row = rows.get(task);
    if (row === undefined) {
      row = toRow(task);
      rows.set(task, row);
    }
    return row;
  };
}

export const rowFromTask = cached<TaskDto>(taskRowFromTask);
export const rowFromHouseholdTask = cached<HouseholdTaskDto>(taskRowFromHouseholdTask);

interface TaskRowProps {
  readonly task: TaskRowModel;
  readonly members: readonly MemberDto[];
  readonly locale: Locale;
  readonly t: Translator;
  readonly busy?: boolean | undefined;
  /** Off on Today's My tasks, where every row is the member's own. */
  readonly showAssignee?: boolean;
  readonly onPress?: ((task: TaskRowModel) => void) | undefined;
  readonly onToggleCompleted?: ((task: TaskRowModel, completed: boolean) => void) | undefined;
  readonly onClaim?: ((task: TaskRowModel) => void) | undefined;
  readonly onUnassign?: ((task: TaskRowModel) => void) | undefined;
  readonly onDelete?: ((task: TaskRowModel) => void) | undefined;
  /** Offered as Mark blocked / Unblock in the overflow. */
  readonly onSetState?: ((task: TaskRowModel, state: TaskState) => void) | undefined;
  readonly onMove?: ((task: TaskRowModel, direction: MoveDirection) => void) | undefined;
  readonly moveUpDisabled?: boolean | undefined;
  readonly moveDownDisabled?: boolean | undefined;
}

function menuActions({
  task,
  t,
  onSetState,
  onUnassign,
  onDelete,
}: Pick<TaskRowProps, 'task' | 't' | 'onSetState' | 'onUnassign' | 'onDelete'>): ActionMenuItem[] {
  const actions: ActionMenuItem[] = [];
  if (onSetState !== undefined && !task.completed) {
    actions.push(
      task.blocked === true
        ? { label: t('task.unblock'), onPress: () => onSetState(task, 'open') }
        : { label: t('task.block'), onPress: () => onSetState(task, 'blocked') },
    );
  }
  if (onUnassign !== undefined && task.assignee_id !== null) {
    actions.push({ label: t('task.unassign.short'), onPress: () => onUnassign(task) });
  }
  if (onDelete !== undefined) {
    actions.push({
      label: t('task.delete.short'),
      onPress: () => onDelete(task),
      destructive: true,
    });
  }
  return actions;
}

function MetaLine({
  task,
  locale,
  t,
}: {
  readonly task: TaskRowModel;
  readonly locale: Locale;
  readonly t: Translator;
}): ReactNode {
  const theme = useTheme();
  const overdue = isOverdue(task);
  const due = task.due_at === null ? null : formatDueShort(task.due_at, locale);
  if (task.list_title === undefined && due === null) return null;
  return (
    <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
      {task.list_title}
      {task.list_title !== undefined && due !== null ? ' · ' : ''}
      {due !== null && (
        // Overdue is spelled out; colour alone would not be enough.
        <Text style={overdue ? [styles.metaStrong, { color: theme.colors.danger }] : undefined}>
          {overdue ? t('task.overdue_on', { date: due }) : due}
        </Text>
      )}
    </Text>
  );
}

function Who({
  task,
  members,
  t,
  busy,
  onClaim,
}: Pick<TaskRowProps, 'task' | 'members' | 't' | 'busy' | 'onClaim'>): ReactNode {
  const theme = useTheme();
  const assignee = members.find((member) => member.user_id === task.assignee_id);
  if (assignee !== undefined) {
    return (
      <View style={styles.who}>
        <Avatar displayName={assignee.display_name} size={28} userId={assignee.user_id} />
        {/* The avatar is decorative; TalkBack reads the name. */}
        <Text style={styles.srOnly}>{assignee.display_name}</Text>
      </View>
    );
  }
  if (task.assignee_id === null && onClaim !== undefined && !task.completed) {
    return (
      <Pressable
        accessibilityLabel={t('task.claim', { title: task.title })}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy === true }}
        android_ripple={{ color: theme.colors.accentSoft }}
        disabled={busy}
        onPress={() => onClaim(task)}
        style={[
          styles.claim,
          {
            borderColor: theme.colors.accent,
            borderRadius: theme.radius.md,
            minHeight: theme.touchTarget,
            opacity: busy === true ? 0.6 : 1,
          },
        ]}
      >
        <Text style={[styles.claimText, { color: theme.colors.accent }]}>
          {t('task.claim.short')}
        </Text>
      </Pressable>
    );
  }
  // Read by TalkBack only: the row says nobody has it without a visible label.
  return task.assignee_id === null ? (
    <Text style={styles.srOnly}>{t('task.assignee.unassigned')}</Text>
  ) : null;
}

function Toggle({
  task,
  t,
  busy,
  onToggleCompleted,
}: Pick<TaskRowProps, 'task' | 't' | 'busy' | 'onToggleCompleted'>): ReactNode {
  const theme = useTheme();
  if (onToggleCompleted === undefined) return <View style={{ width: 4 }} />;
  const blocked = busy === true;
  return (
    <Pressable
      accessibilityLabel={
        task.completed
          ? t('task.incomplete', { title: task.title })
          : t('task.complete', { title: task.title })
      }
      accessibilityRole="checkbox"
      accessibilityState={{ checked: task.completed, disabled: blocked }}
      disabled={blocked}
      hitSlop={4}
      onPress={() => onToggleCompleted(task, !task.completed)}
      style={[styles.toggle, { minHeight: theme.touchTarget, minWidth: theme.touchTarget }]}
    >
      <View
        style={[
          styles.box,
          {
            backgroundColor: task.completed ? theme.colors.accentSoft : theme.colors.surface,
            borderColor: task.completed ? theme.colors.accent : theme.colors.borderStrong,
          },
        ]}
      >
        {task.completed && <Text style={[styles.check, { color: theme.colors.accent }]}>✓</Text>}
      </View>
    </Pressable>
  );
}

function Body({
  task,
  locale,
  t,
  onPress,
}: Pick<TaskRowProps, 'task' | 'locale' | 't' | 'onPress'>): ReactNode {
  const theme = useTheme();
  const hasNotes = task.notes !== undefined && task.notes !== null && task.notes.length > 0;
  return (
    <Pressable
      accessibilityLabel={task.title}
      accessibilityRole={onPress === undefined ? undefined : 'button'}
      disabled={onPress === undefined}
      onPress={() => onPress?.(task)}
      style={styles.body}
    >
      <View style={styles.headline}>
        <Text
          style={[
            styles.title,
            { color: task.completed ? theme.colors.textMuted : theme.colors.text },
            task.completed && styles.titleDone,
          ]}
        >
          {task.title}
        </Text>
        {task.blocked === true && !task.completed && (
          <View
            style={[
              styles.pill,
              { backgroundColor: theme.colors.warningSoft, borderRadius: theme.radius.pill },
            ]}
          >
            <Text style={[styles.pillText, { color: theme.colors.warning }]}>
              {t('task.status.blocked')}
            </Text>
          </View>
        )}
      </View>
      {hasNotes && (
        <Text numberOfLines={1} style={[styles.meta, { color: theme.colors.textMuted }]}>
          {task.notes}
        </Text>
      )}
      <MetaLine locale={locale} t={t} task={task} />
    </Pressable>
  );
}

export const TaskRow = memo(function TaskRow(props: TaskRowProps): ReactNode {
  const { task, members, locale, t, busy = false, showAssignee = true, onMove } = props;
  const theme = useTheme();

  return (
    <View style={[styles.row, { borderTopColor: theme.colors.border }]}>
      <Toggle busy={busy} onToggleCompleted={props.onToggleCompleted} t={t} task={task} />
      <Body locale={locale} onPress={props.onPress} t={t} task={task} />
      {showAssignee && (
        <Who busy={busy} members={members} onClaim={props.onClaim} t={t} task={task} />
      )}
      {onMove === undefined ? (
        <ActionMenu
          accessibilityLabel={t('task.actions', { title: task.title })}
          actions={menuActions(props)}
          disabled={busy}
        />
      ) : (
        <MoveControls
          busy={busy}
          moveDownDisabled={props.moveDownDisabled}
          moveUpDisabled={props.moveUpDisabled}
          onMove={onMove}
          t={t}
          task={task}
        />
      )}
    </View>
  );
});

function MoveControls({
  task,
  t,
  busy,
  onMove,
  moveUpDisabled,
  moveDownDisabled,
}: Pick<TaskRowProps, 'task' | 't' | 'busy' | 'moveUpDisabled' | 'moveDownDisabled'> & {
  readonly onMove: (task: TaskRowModel, direction: MoveDirection) => void;
}): ReactNode {
  const theme = useTheme();
  const button = (direction: MoveDirection, disabled: boolean): ReactNode => (
    <Pressable
      accessibilityLabel={t(direction === 'up' ? 'task.move.up' : 'task.move.down', {
        title: task.title,
      })}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy === true }}
      disabled={disabled || busy}
      hitSlop={4}
      onPress={() => onMove(task, direction)}
      style={[styles.moveButton, { minHeight: theme.touchTarget, minWidth: theme.touchTarget }]}
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
  return (
    <View style={styles.moveActions}>
      {button('up', moveUpDisabled === true)}
      {button('down', moveDownDisabled === true)}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, gap: 2, minWidth: 0, paddingVertical: 10 },
  box: {
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1.5,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  check: { fontSize: 14, fontWeight: '700', lineHeight: 16 },
  claim: {
    alignItems: 'center',
    borderWidth: 1.5,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  claimText: { fontSize: 14, fontWeight: '700' },
  headline: { alignItems: 'center', columnGap: 6, flexDirection: 'row', flexWrap: 'wrap' },
  meta: { fontSize: 13 },
  metaStrong: { fontWeight: '700' },
  moveActions: { flexDirection: 'row' },
  moveButton: { alignItems: 'center', justifyContent: 'center' },
  moveGlyph: { fontSize: 18, fontWeight: '700' },
  pill: { paddingHorizontal: 7, paddingVertical: 1 },
  pillText: { fontSize: 12, fontWeight: '700' },
  row: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    paddingRight: 4,
  },
  srOnly: { height: 1, opacity: 0, position: 'absolute', width: 1 },
  title: { flexShrink: 1, fontSize: 16, fontWeight: '500' },
  titleDone: { textDecorationLine: 'line-through' },
  toggle: { alignItems: 'center', justifyContent: 'center' },
  who: { alignItems: 'center', justifyContent: 'center', minWidth: 36 },
});
