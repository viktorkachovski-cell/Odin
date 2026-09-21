import type { ReactNode } from 'react';
import { Link } from 'react-router';

import type { CommandError, MemberDto, TaskDto, TaskRowModel } from '@odin/contracts';
import { taskRowFromTask } from '@odin/contracts';
import type { Locale, TranslationKey, Translator } from '@odin/i18n';

import { ErrorBanner } from './Banner.tsx';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { OverflowMenu } from './OverflowMenu.tsx';
import { TaskRow } from './TaskRow.tsx';

/**
 * The pieces of the list-detail screen: its task list, its sticky header and
 * its stack of command errors. They live here rather than beside the route so
 * the route is the data and command wiring and nothing else.
 */

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
    <ul className="task-list">
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
    </ul>
  );
}

export function ListHeader({
  title,
  subtitle,
  isTemplate,
  t,
  pending,
  onEdit,
  onAddTask,
  onDelete,
}: {
  readonly title: string;
  readonly subtitle: string | null;
  readonly isTemplate: boolean;
  readonly t: Translator;
  readonly pending: boolean;
  readonly onEdit: () => void;
  readonly onAddTask: () => void;
  readonly onDelete: () => void;
}): ReactNode {
  return (
    <div className="page-header page-header--sticky">
      <div>
        <Link to="/">{t('list.back')}</Link>
        <h1>{title}</h1>
        {subtitle !== null && <p className="card__subtitle">{subtitle}</p>}
      </div>
      {!isTemplate && (
        <div className="action-group">
          <OverflowMenu
            disabled={pending}
            items={[
              { key: 'edit', label: t('list.edit'), glyph: '✎', onSelect: onEdit },
              {
                key: 'delete',
                label: t('list.delete'),
                glyph: '⌫',
                danger: true,
                onSelect: onDelete,
              },
            ]}
            label={t('list.actions')}
          />
          <button
            className="button button--primary page-header__primary"
            onClick={onAddTask}
            type="button"
          >
            {t('list.add_task')}
          </button>
        </div>
      )}
    </div>
  );
}

export function CommandErrors({
  errors,
  t,
  onRetry,
}: {
  readonly errors: readonly { readonly error: CommandError | null; readonly retry?: () => void }[];
  readonly t: Translator;
  readonly onRetry?: () => void;
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
                onRetry={retry ?? onRetry}
                t={t}
              />,
            ],
      )}
    </>
  );
}

/**
 * A destructive command waiting on confirmation. It carries its own copy and
 * its own effect, so the dialog renders from the descriptor rather than
 * re-deriving which command is pending.
 */
export interface PendingConfirm {
  readonly titleKey: TranslationKey;
  readonly bodyKey: TranslationKey;
  readonly confirmKey: TranslationKey;
  readonly run: () => void;
}

/** True while any of the given commands is in flight. */
export function anyPending(states: readonly { readonly pending: boolean }[]): boolean {
  return states.some((state) => state.pending);
}

export function DestructiveConfirm({
  confirm,
  pending,
  t,
  onClose,
}: {
  readonly confirm: PendingConfirm | null;
  readonly pending: boolean;
  readonly t: Translator;
  readonly onClose: () => void;
}): ReactNode {
  if (confirm === null) return null;

  return (
    <ConfirmDialog
      body={t(confirm.bodyKey)}
      confirmLabel={t(confirm.confirmKey)}
      onCancel={onClose}
      onConfirm={() => {
        confirm.run();
        onClose();
      }}
      pending={pending}
      t={t}
      title={t(confirm.titleKey)}
    />
  );
}
