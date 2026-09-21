import type { ReactNode } from 'react';
import { View } from 'react-native';

import {
  taskRowFromTask,
  type CommandError,
  type MemberDto,
  type TaskDto,
  type TaskRowModel,
} from '@odin/contracts';
import type { Locale, Translator } from '@odin/i18n';

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
}): ReactNode {
  return (
    <View style={{ gap: 12 }}>
      {tasks.map((task) => (
        <TaskRow
          busy={busy}
          key={task.id}
          locale={locale}
          members={members}
          onDelete={isTemplate ? undefined : onDelete}
          onEdit={isTemplate ? undefined : onEdit}
          onToggleCompleted={isTemplate ? undefined : onToggleCompleted}
          onUnassign={isTemplate ? undefined : onUnassign}
          t={t}
          task={taskRowFromTask(task)}
        />
      ))}
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
  if (isTemplate) return null;
  return (
    <View style={{ alignItems: 'flex-end' }}>
      <ActionMenu
        accessibilityLabel={t('list.actions')}
        actions={[
          { label: t('list.edit'), onPress: onEdit },
          { label: t('list.delete'), onPress: onDelete, destructive: true },
        ]}
        disabled={pending}
      />
    </View>
  );
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
