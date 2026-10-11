import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';

import type {
  CommandError,
  MemberDto,
  MoveDirection,
  TaskDto,
  TaskRowModel,
} from '@odin/contracts';
import { taskRowFromTask } from '@odin/contracts';
import { adjacentMoves, validateTaskTitle } from '@odin/domain';
import { issueText, type Locale, type TranslationKey, type Translator } from '@odin/i18n';

import { ErrorBanner } from './Banner.tsx';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { Icon } from './Icon.tsx';
import { OverflowMenu } from './OverflowMenu.tsx';
import { TaskRow } from './TaskRow.tsx';
import { TaskTable } from './TaskTable.tsx';
import type { TaskRowHandlers } from './useTaskWiring.tsx';

/** Row handlers a list screen passes down; a template passes none of them. */
export type ListRowHandlers = Partial<TaskRowHandlers> & {
  readonly onOpenDetails: (task: TaskRowModel) => void;
};

/**
 * A list's tasks: open ones first, completed ones collapsed behind a count.
 * Move controls appear only in reorder mode and keep each task inside its own
 * completion group. A template's tasks are read-only apart from order.
 */
export function ListTasks({
  tasks,
  members,
  locale,
  t,
  isTemplate,
  reorder,
  busy,
  handlers,
  onMoveTask,
  before,
}: {
  readonly tasks: readonly TaskDto[];
  readonly members: readonly MemberDto[];
  readonly locale: Locale;
  readonly t: Translator;
  readonly isTemplate: boolean;
  readonly reorder: boolean;
  readonly busy: boolean;
  readonly handlers: ListRowHandlers;
  readonly onMoveTask: (task: TaskRowModel, direction: MoveDirection) => void;
  readonly before?: ReactNode;
}): ReactNode {
  const [showDone, setShowDone] = useState(false);
  const open = tasks.filter((task) => !task.completed);
  const done = tasks.filter((task) => task.completed);
  const now = new Date();

  const row = (task: TaskDto): ReactNode => {
    const index = tasks.indexOf(task);
    const moves = adjacentMoves(tasks, index, (entry) => entry.completed);
    const runtime = isTemplate ? {} : handlers;
    return (
      <TaskRow
        {...runtime}
        busy={busy}
        key={task.id}
        locale={locale}
        members={members}
        moveDownDisabled={!moves.down}
        moveUpDisabled={!moves.up}
        now={now}
        onMove={reorder ? onMoveTask : undefined}
        onOpenDetails={handlers.onOpenDetails}
        showList={false}
        t={t}
        task={taskRowFromTask(task)}
      />
    );
  };

  return (
    <TaskTable before={before} reorder={reorder} showList={false} t={t}>
      {open.length > 0 && (
        <section className="task-group">
          <h2 className="task-group__heading">{t('list.group.open', { count: open.length })}</h2>
          <ul className="task-list">{open.map(row)}</ul>
        </section>
      )}
      {done.length > 0 && (
        <section className="task-group">
          <h2 className="task-group__heading">
            <button
              aria-expanded={showDone || reorder}
              className="disclosure"
              onClick={() => setShowDone((current) => !current)}
              type="button"
            >
              <Icon name="chevron-down" size={16} />
              {t('list.group.done', { count: done.length })}
            </button>
          </h2>
          {(showDone || reorder) && <ul className="task-list">{done.map(row)}</ul>}
        </section>
      )}
    </TaskTable>
  );
}

/** Add a task by typing its title. Details are filled in from the task panel. */
export function QuickAdd({
  t,
  pending,
  error,
  onAdd,
}: {
  readonly t: Translator;
  readonly pending: boolean;
  readonly error: CommandError | null;
  readonly onAdd: (title: string, done: () => void) => void;
}): ReactNode {
  const [title, setTitle] = useState('');
  const [issue, setIssue] = useState<string | undefined>(undefined);
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const check = validateTaskTitle(title);
    setIssue(issueText(check, t));
    if (check !== null) return;
    onAdd(title.trim(), () => setTitle(''));
  };
  return (
    <form className="quick-add" onSubmit={submit}>
      <span aria-hidden="true" className="quick-add__icon">
        <Icon name="plus" />
      </span>
      <label className="visually-hidden" htmlFor="quick-add-title">
        {t('list.quick_add.label')}
      </label>
      <input
        aria-describedby={issue === undefined ? undefined : 'quick-add-error'}
        aria-invalid={issue === undefined ? undefined : true}
        className="field__control quick-add__input"
        id="quick-add-title"
        onChange={(event) => setTitle(event.target.value)}
        placeholder={t('list.quick_add.placeholder')}
        type="text"
        value={title}
      />
      <button className="button button--primary" disabled={pending} type="submit">
        {pending ? t('state.saving') : t('list.add_task')}
      </button>
      {issue !== undefined && (
        <span className="field__error quick-add__error" id="quick-add-error">
          {issue}
        </span>
      )}
      {error !== null && issue === undefined && (
        <span className="quick-add__error">
          <ErrorBanner error={error} t={t} />
        </span>
      )}
    </form>
  );
}

export function ListHeader({
  title,
  subtitle,
  notes,
  isTemplate,
  t,
  pending,
  reorder,
  canReorder,
  onToggleReorder,
  onEdit,
  onDelete,
  onSaveTemplate,
  children,
}: {
  readonly children?: ReactNode;
  readonly title: string;
  readonly subtitle: string | null;
  readonly notes: string | null;
  readonly isTemplate: boolean;
  readonly t: Translator;
  readonly pending: boolean;
  readonly reorder: boolean;
  readonly canReorder: boolean;
  readonly onToggleReorder: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly onSaveTemplate: () => void;
}): ReactNode {
  return (
    <>
      <nav aria-label={t('list.breadcrumb')} className="breadcrumb">
        <Link to={isTemplate ? '/lists?tab=templates' : '/lists'}>{t('lists.title')}</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{title}</span>
      </nav>
      <div className="page-header">
        <div className="page-header__titles">
          <h1>{title}</h1>
          {subtitle !== null && <span className="page-header__sub">{subtitle}</span>}
        </div>
        <div className="action-group">
          {canReorder && (
            <button
              aria-pressed={reorder}
              className="button button--quiet"
              onClick={onToggleReorder}
              type="button"
            >
              <Icon name="reorder" size={18} />
              {reorder ? t('lists.reorder.done') : t('lists.reorder')}
            </button>
          )}
          {/*
           * A template is read-only apart from being removable, so it gets the
           * delete entry and nothing else.
           */}
          <OverflowMenu
            disabled={pending}
            items={[
              ...(isTemplate
                ? []
                : [
                    { key: 'edit', label: t('list.edit'), onSelect: onEdit },
                    { key: 'template', label: t('list.template.save'), onSelect: onSaveTemplate },
                  ]),
              { key: 'delete', label: t('list.delete'), danger: true, onSelect: onDelete },
            ]}
            label={t('list.actions')}
          />
        </div>
      </div>
      {children}
      {notes !== null && (
        <details className="notes" open>
          <summary className="notes__summary">{t('list.notes')}</summary>
          <p className="notes__body">{notes}</p>
        </details>
      )}
    </>
  );
}

export function CommandErrors({
  errors,
  t,
}: {
  readonly errors: readonly { readonly error: CommandError | null; readonly retry?: () => void }[];
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
