import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
  CommandError,
  MemberDto,
  MoveDirection,
  TaskDto,
  TaskRowModel,
  TaskState,
} from '@odin/contracts';
import { adjacentMoves, validateTaskTitle } from '@odin/domain';
import { issueText, type Locale, type Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';
import { ActionMenu } from './ActionMenu.tsx';
import { ErrorBanner } from './Banner.tsx';
import { GroupHeading } from './Blocks.tsx';
import { useNavBarHeight } from './layout.ts';
import { rowFromTask, TaskRow } from './TaskRow.tsx';

/** Row handlers a list screen passes; a template passes only `onPress`. */
interface ListRowHandlers {
  readonly onPress: (task: TaskRowModel) => void;
  readonly onToggleCompleted?: (task: TaskRowModel, completed: boolean) => void;
  readonly onSetState?: (task: TaskRowModel, state: TaskState) => void;
  readonly onClaim?: (task: TaskRowModel) => void;
  readonly onUnassign?: (task: TaskRowModel) => void;
  readonly onDelete?: (task: TaskRowModel) => void;
}

/**
 * A list's tasks: open first, completed collapsed behind a count. In reorder
 * mode the overflow gives way to move controls that keep each task inside its
 * completion group. A template's tasks are read-only apart from order.
 */
export function ListTasks({
  tasks,
  members,
  locale,
  t,
  isTemplate,
  reorder = false,
  busy,
  handlers,
  onMove,
}: {
  readonly tasks: readonly TaskDto[];
  readonly members: readonly MemberDto[];
  readonly locale: Locale;
  readonly t: Translator;
  readonly isTemplate: boolean;
  readonly reorder?: boolean;
  readonly busy: boolean;
  readonly handlers: ListRowHandlers;
  readonly onMove: (task: TaskRowModel, direction: MoveDirection) => void;
}): ReactNode {
  const theme = useTheme();
  const [showDone, setShowDone] = useState(false);
  const open = tasks.filter((task) => !task.completed);
  const done = tasks.filter((task) => task.completed);
  const runtime = isTemplate ? { onPress: handlers.onPress } : handlers;

  const row = (task: TaskDto): ReactNode => {
    const moves = adjacentMoves(tasks, tasks.indexOf(task), (entry) => entry.completed);
    return (
      <TaskRow
        {...runtime}
        busy={busy}
        key={task.id}
        locale={locale}
        members={members}
        moveDownDisabled={!moves.down}
        moveUpDisabled={!moves.up}
        onMove={reorder ? onMove : undefined}
        t={t}
        task={rowFromTask(task)}
      />
    );
  };

  return (
    <View>
      {open.length > 0 && <GroupHeading label={t('list.group.open', { count: open.length })} />}
      {open.map(row)}
      {done.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showDone || reorder }}
          onPress={() => setShowDone((current) => !current)}
          style={[
            styles.disclosure,
            { borderTopColor: theme.colors.border, minHeight: theme.touchTarget },
          ]}
        >
          <Text style={[styles.disclosureText, { color: theme.colors.accent }]}>
            {showDone || reorder ? '▾ ' : '▸ '}
            {t('list.group.done', { count: done.length })}
          </Text>
        </Pressable>
      )}
      {(showDone || reorder) && done.map(row)}
    </View>
  );
}

/**
 * The list's own text. The screen header already carries the title, so this is
 * the subtitle and, under it, the shared note.
 */
export function ListMeta({
  subtitle,
  notes,
  t,
}: {
  readonly subtitle: string | null;
  readonly notes: string | null;
  readonly t: Translator;
}): ReactNode {
  const theme = useTheme();
  const [notesOpen, setNotesOpen] = useState(false);
  if (subtitle === null && notes === null) return null;
  return (
    <View style={styles.meta}>
      {subtitle !== null && (
        <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>{subtitle}</Text>
      )}
      {notes !== null && (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: notesOpen }}
            onPress={() => setNotesOpen((current) => !current)}
            style={[styles.notesToggle, { minHeight: theme.touchTarget }]}
          >
            <Text style={[styles.disclosureText, { color: theme.colors.accent }]}>
              {notesOpen ? '▾ ' : '▸ '}
              {t('list.notes')}
            </Text>
          </Pressable>
          {notesOpen && (
            <Text style={[styles.metaText, { color: theme.colors.text }]}>{notes}</Text>
          )}
        </>
      )}
    </View>
  );
}

export function ListHeader({
  isTemplate,
  t,
  pending,
  reorder,
  canReorder,
  onEdit,
  onDelete,
  onSaveTemplate,
  onToggleReorder,
}: {
  readonly isTemplate: boolean;
  readonly t: Translator;
  readonly pending: boolean;
  readonly reorder: boolean;
  readonly canReorder: boolean;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly onSaveTemplate: () => void;
  readonly onToggleReorder: () => void;
}): ReactNode {
  return (
    <ActionMenu
      accessibilityLabel={t('list.actions')}
      actions={[
        ...(isTemplate
          ? []
          : [
              { label: t('list.edit'), onPress: onEdit },
              { label: t('list.template.save'), onPress: onSaveTemplate },
            ]),
        ...(canReorder
          ? [
              {
                label: reorder ? t('lists.reorder.done') : t('lists.reorder'),
                onPress: onToggleReorder,
              },
            ]
          : []),
        { label: t('list.delete'), onPress: onDelete, destructive: true },
      ]}
      disabled={pending}
    />
  );
}

/** Add a task by typing its title; details are filled in from the task editor. */
export function QuickAddBar({
  t,
  pending,
  onAdd,
}: {
  readonly t: Translator;
  readonly pending: boolean;
  readonly onAdd: (title: string, done: () => void) => void;
}): ReactNode {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const navHeight = useNavBarHeight();
  const [title, setTitle] = useState('');
  const [issue, setIssue] = useState<string | undefined>(undefined);
  const submit = (): void => {
    const check = validateTaskTitle(title);
    setIssue(issueText(check, t));
    if (check !== null) return;
    onAdd(title.trim(), () => setTitle(''));
  };
  return (
    <View
      style={[
        styles.quickAdd,
        {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          bottom: navHeight + insets.bottom,
        },
      ]}
    >
      <View style={styles.quickRow}>
        <TextInput
          accessibilityLabel={t('list.quick_add.label')}
          blurOnSubmit={false}
          onChangeText={(next) => {
            setTitle(next);
            setIssue(undefined);
          }}
          onSubmitEditing={submit}
          placeholder={t('list.quick_add.short')}
          placeholderTextColor={theme.colors.textMuted}
          returnKeyType="done"
          style={[
            styles.quickInput,
            {
              borderColor: issue === undefined ? theme.colors.borderStrong : theme.colors.danger,
              borderRadius: theme.radius.md,
              color: theme.colors.text,
              minHeight: theme.touchTarget,
            },
          ]}
          value={title}
        />
        <Pressable
          accessibilityLabel={t('list.add_task')}
          accessibilityRole="button"
          accessibilityState={{ disabled: pending, busy: pending }}
          disabled={pending}
          onPress={submit}
          style={[
            styles.quickButton,
            {
              backgroundColor: theme.colors.accent,
              borderRadius: theme.radius.md,
              minHeight: theme.touchTarget,
              minWidth: theme.touchTarget,
              opacity: pending ? 0.6 : 1,
            },
          ]}
        >
          <Text style={[styles.quickPlus, { color: theme.colors.accentText }]}>+</Text>
        </Pressable>
      </View>
      {issue !== undefined && (
        <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.danger }}>
          {issue}
        </Text>
      )}
    </View>
  );
}

interface CommandErrorEntry {
  readonly error: CommandError | null;
  readonly retry?: () => void;
}

export function CommandErrors({
  errors,
  t,
}: {
  readonly errors: readonly CommandErrorEntry[];
  readonly t: Translator;
}): ReactNode {
  return (
    <>
      {errors.flatMap(({ error, retry }, index) =>
        error === null
          ? []
          : [
              <ErrorBanner
                error={error}
                key={`${error.message_key}-${index}`}
                onRetry={retry}
                t={t}
              />,
            ],
      )}
    </>
  );
}

const styles = StyleSheet.create({
  disclosure: {
    borderTopWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  disclosureText: { fontSize: 14, fontWeight: '700' },
  meta: { gap: 2 },
  metaText: { fontSize: 14 },
  notesToggle: { alignSelf: 'flex-start', justifyContent: 'center' },
  quickAdd: {
    borderTopWidth: 1,
    gap: 4,
    left: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: 'absolute',
    right: 0,
  },
  quickButton: { alignItems: 'center', justifyContent: 'center' },
  quickInput: { borderWidth: 1, flex: 1, fontSize: 16, paddingHorizontal: 12 },
  quickPlus: { fontSize: 24, fontWeight: '600', lineHeight: 26 },
  quickRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
});
