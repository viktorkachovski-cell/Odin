import { memo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

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
import { isOverdue, taskRowActions, type TaskRowAction } from '@odin/domain';
import { formatDueShort, TASK_ACTION_KEYS, type Locale, type Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';
import { ActionMenu, type ActionMenuItem } from './ActionMenu.tsx';
import { MoveButtons } from './Blocks.tsx';
import { AccentButton } from './Button.tsx';

/**
 * A task row: completion, the task, who has it, and one overflow menu. It
 * shows exceptions rather than defaults -- a status label only when Blocked, no
 * "No deadline" text, and Claim instead of an "Unassigned" label. Completing a
 * task and opening it are separate targets. Move controls appear only in
 * reorder mode.
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
  readonly currentUserId?: string | undefined;
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
  const run: Record<TaskRowAction, () => void> = {
    block: () => onSetState?.(task, 'blocked'),
    unblock: () => onSetState?.(task, 'open'),
    unassign: () => onUnassign?.(task),
    delete: () => onDelete?.(task),
  };
  const wired = {
    state: onSetState !== undefined,
    unassign: onUnassign !== undefined,
    remove: onDelete !== undefined,
  };
  return taskRowActions(task, wired).map((action) => ({
    label: t(TASK_ACTION_KEYS[action]),
    onPress: run[action],
    destructive: action === 'delete',
  }));
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
  if (task.list_title === undefined && due === null && !task.blocked) return null;
  return (
    <View style={styles.metaLines}>
      {task.list_title !== undefined && (
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{task.list_title}</Text>
      )}
      <View style={styles.statusLine}>
        {due !== null && (
          // Overdue is spelled out; colour alone would not be enough.
          <Text
            style={[
              styles.deadline,
              { color: overdue ? theme.colors.danger : theme.colors.textMuted },
            ]}
          >
            {overdue ? t('task.overdue_on', { date: due }) : due}
          </Text>
        )}
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
    </View>
  );
}

function Who({
  task,
  t,
  busy,
  onClaim,
}: Pick<TaskRowProps, 'task' | 't' | 'busy' | 'onClaim'>): ReactNode {
  if (task.assignee_id === null && onClaim !== undefined && !task.completed) {
    return (
      <AccentButton
        accessibilityLabel={t('task.claim', { title: task.title })}
        disabled={busy === true}
        label={t('task.claim.short')}
        onPress={() => onClaim(task)}
      />
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
  members,
  currentUserId,
  showAssignee,
  locale,
  t,
  onPress,
}: Pick<
  TaskRowProps,
  'task' | 'members' | 'currentUserId' | 'showAssignee' | 'locale' | 't' | 'onPress'
>): ReactNode {
  const theme = useTheme();
  const assignee =
    showAssignee === false
      ? undefined
      : members.find((member) => member.user_id === task.assignee_id);
  const assigneeName =
    assignee?.user_id === currentUserId && assignee !== undefined
      ? t('task.assignee.you')
      : assignee?.display_name;
  const due = task.due_at === null ? undefined : formatDueShort(task.due_at, locale);
  const label = [
    task.title,
    task.list_title,
    due,
    task.blocked && !task.completed ? t('task.status.blocked') : undefined,
    assigneeName,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <Pressable
      accessibilityLabel={label}
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
      </View>
      <MetaLine locale={locale} t={t} task={task} />
      {assigneeName !== undefined && (
        <Text style={[styles.meta, { color: theme.colors.textMuted }]}>{assigneeName}</Text>
      )}
    </Pressable>
  );
}

export const TaskRow = memo(function TaskRow(props: TaskRowProps): ReactNode {
  const { task, members, locale, t, busy = false, showAssignee = true, onMove } = props;
  const theme = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.25;

  return (
    <View
      style={[
        styles.row,
        stacked && styles.stacked,
        { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
      ]}
    >
      <View style={[styles.main, stacked && styles.fullWidth]}>
        <Toggle busy={busy} onToggleCompleted={props.onToggleCompleted} t={t} task={task} />
        <Body
          currentUserId={props.currentUserId}
          showAssignee={showAssignee}
          members={members}
          locale={locale}
          onPress={props.onPress}
          t={t}
          task={task}
        />
      </View>
      <View style={styles.actions}>
        {showAssignee && <Who busy={busy} onClaim={props.onClaim} t={t} task={task} />}
        {onMove === undefined ? (
          <ActionMenu
            accessibilityLabel={t('task.actions', { title: task.title })}
            actions={menuActions(props)}
            disabled={busy}
          />
        ) : (
          <MoveButtons
            downDisabled={busy || props.moveDownDisabled === true}
            label={(direction) => t(`task.move.${direction}`, { title: task.title })}
            onMove={(direction) => onMove(task, direction)}
            upDisabled={busy || props.moveUpDisabled === true}
          />
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  actions: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    marginLeft: 'auto',
  },
  main: { alignItems: 'flex-start', flex: 1, flexDirection: 'row', minWidth: 0 },
  fullWidth: { flexBasis: '100%' },
  stacked: { flexWrap: 'wrap' },
  body: { flex: 1, gap: 4, minWidth: 0, paddingVertical: 12 },
  box: {
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1.5,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  check: { fontSize: 14, fontWeight: '700', lineHeight: 16 },
  headline: { alignItems: 'center', columnGap: 6, flexDirection: 'row', flexWrap: 'wrap' },
  meta: { fontSize: 13, lineHeight: 18 },
  metaLines: { gap: 4 },
  deadline: { fontSize: 12, fontWeight: '500', lineHeight: 18 },
  statusLine: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { paddingHorizontal: 7, paddingVertical: 1 },
  pillText: { fontSize: 12, fontWeight: '700' },
  row: {
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    marginBottom: 8,
    flexDirection: 'row',
    gap: 4,
    paddingRight: 4,
  },
  srOnly: { height: 1, opacity: 0, position: 'absolute', width: 1 },
  title: { flexShrink: 1, fontSize: 16, fontWeight: '500', lineHeight: 24 },
  titleDone: { textDecorationLine: 'line-through' },
  toggle: { alignItems: 'center', justifyContent: 'center' },
});
