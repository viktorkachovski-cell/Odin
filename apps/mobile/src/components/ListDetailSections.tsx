import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  taskRowFromTask,
  type CommandError,
  type MemberDto,
  type MoveDirection,
  type TaskDto,
  type TaskRowModel,
  type TaskState,
} from '@odin/contracts';
import { adjacentMoves } from '@odin/domain';
import type { Locale, Translator } from '@odin/i18n';

import { useTheme } from '../theme.ts';
import { ActionMenu } from './ActionMenu.tsx';
import { ErrorBanner } from './Banner.tsx';
import { Progress } from './Progress.tsx';
import { TaskRow } from './TaskRow.tsx';

export function ListTasks({
  tasks,
  members,
  locale,
  t,
  isTemplate,
  busy,
  onEdit,
  onToggleCompleted,
  onUnassign,
  onDelete,
  onOpen,
  onSetState,
  onMove,
}: {
  readonly tasks: readonly TaskDto[];
  readonly members: readonly MemberDto[];
  readonly locale: Locale;
  readonly t: Translator;
  readonly isTemplate: boolean;
  readonly busy: boolean;
  readonly onEdit: (task: TaskRowModel) => void;
  readonly onToggleCompleted: (task: TaskRowModel, completed: boolean) => void;
  readonly onUnassign: (task: TaskRowModel) => void;
  readonly onDelete: (task: TaskRowModel) => void;
  readonly onOpen: (task: TaskRowModel) => void;
  readonly onSetState: (task: TaskRowModel, state: TaskState) => void;
  readonly onMove: (task: TaskRowModel, direction: MoveDirection) => void;
}): ReactNode {
  // A template's tasks can be reordered but carry no runtime state, so they
  // keep the move controls and lose everything else.
  return (
    <View style={{ gap: 12 }}>
      {tasks.map((task, index) => {
        const moves = adjacentMoves(tasks, index, (row) => row.completed);
        return (
          <TaskRow
            busy={busy}
            key={task.id}
            locale={locale}
            members={members}
            moveDownDisabled={!moves.down}
            moveUpDisabled={!moves.up}
            onMove={onMove}
            onPress={onOpen}
            onDelete={isTemplate ? undefined : onDelete}
            onEdit={isTemplate ? undefined : onEdit}
            onSetState={isTemplate ? undefined : onSetState}
            onToggleCompleted={isTemplate ? undefined : onToggleCompleted}
            onUnassign={isTemplate ? undefined : onUnassign}
            t={t}
            task={taskRowFromTask(task)}
          />
        );
      })}
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
}: {
  readonly subtitle: string | null;
  readonly notes: string | null;
}): ReactNode {
  const theme = useTheme();
  if (subtitle === null && notes === null) return null;
  return (
    <View style={styles.meta}>
      {subtitle !== null && (
        <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>{subtitle}</Text>
      )}
      {notes !== null && (
        <Text style={[styles.metaText, { color: theme.colors.textMuted }]}>{notes}</Text>
      )}
    </View>
  );
}

export function ListHeader({
  isTemplate,
  t,
  pending,
  onEdit,
  onDelete,
}: {
  readonly isTemplate: boolean;
  readonly t: Translator;
  readonly pending: boolean;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}): ReactNode {
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <ActionMenu
        accessibilityLabel={t('list.actions')}
        actions={[
          // A template is read-only apart from being removable, so it gets the
          // delete entry and nothing else.
          ...(isTemplate ? [] : [{ label: t('list.edit'), onPress: onEdit }]),
          { label: t('list.delete'), onPress: onDelete, destructive: true },
        ]}
        disabled={pending}
      />
    </View>
  );
}

/** True while any of the given commands is in flight. */
export function anyPending(states: readonly { readonly pending: boolean }[]): boolean {
  return states.some((state) => state.pending);
}

/**
 * The confirmation after saving a list template. It lives here so the screen
 * stays data and command wiring, and renders nothing while a command error is
 * already on screen.
 */
export function TemplateSavedNotice({
  saved,
  error,
  t,
}: {
  readonly saved: boolean;
  readonly error: CommandError | null;
  readonly t: Translator;
}): ReactNode {
  if (!saved || error !== null) return null;
  return <Text accessibilityLiveRegion="polite">{t('list.template.saved')}</Text>;
}

export interface CommandErrorEntry {
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

export function ListProgress({
  isTemplate,
  completed,
  total,
  t,
}: {
  readonly isTemplate: boolean;
  readonly completed: number;
  readonly total: number;
  readonly t: Translator;
}): ReactNode {
  if (isTemplate) return null;
  return <Progress completed={completed} t={t} total={total} />;
}

const styles = StyleSheet.create({
  meta: { gap: 4 },
  metaText: { fontSize: 14 },
});
