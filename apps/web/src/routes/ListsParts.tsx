import type { ReactNode } from 'react';
import { Link } from 'react-router';

import type { ListSummaryDto, MoveDirection } from '@odin/contracts';
import { progressPercent } from '@odin/domain';
import type { Translator } from '@odin/i18n';

import { MoveButtons } from '../components/Controls.tsx';
import { OverflowMenu, type OverflowItem } from '../components/OverflowMenu.tsx';

/** A thin progress bar; the numbers beside it carry the meaning. */
export function ProgressBar({
  completed,
  total,
}: {
  readonly completed: number;
  readonly total: number;
}): ReactNode {
  return (
    <span aria-hidden="true" className="progress-bar">
      <span
        className="progress-bar__fill"
        style={{ width: `${progressPercent(completed, total)}%` }}
      />
    </span>
  );
}

/** A list as a compact link: title, done/total and a bar. Used on Today. */
export function ListProgressLink({
  list,
  t,
}: {
  readonly list: ListSummaryDto;
  readonly t: Translator;
}): ReactNode {
  return (
    <Link className="list-progress" to={`/lists/${list.id}`}>
      <span className="list-progress__row">
        <span className="list-progress__title">{list.title}</span>
        <span className="list-progress__count">
          {t('lists.progress.short', { completed: list.completed_tasks, total: list.total_tasks })}
        </span>
      </span>
      <ProgressBar completed={list.completed_tasks} total={list.total_tasks} />
    </Link>
  );
}

function ListMoves({ list, t, busy, moveUpDisabled, moveDownDisabled, onMove }: ListRowProps) {
  return (
    <MoveButtons
      downDisabled={busy || moveDownDisabled}
      label={(direction) => t(`list.move.${direction}`, { title: list.title })}
      onMove={onMove}
      upDisabled={busy || moveUpDisabled}
    />
  );
}

interface ListRowProps {
  readonly list: ListSummaryDto;
  readonly t: Translator;
  readonly busy: boolean;
  readonly reorder: boolean;
  readonly moveUpDisabled: boolean;
  readonly moveDownDisabled: boolean;
  readonly onMove: (direction: MoveDirection) => void;
  readonly onDelete: () => void;
  readonly onSaveTemplate?: (() => void) | undefined;
  readonly onCopy?: (() => void) | undefined;
}

function rowMenu({ list, t, onDelete, onSaveTemplate }: ListRowProps): OverflowItem[] {
  return [
    ...(onSaveTemplate === undefined
      ? []
      : [{ key: 'template', label: t('list.template.save'), onSelect: onSaveTemplate }]),
    { key: 'delete', label: t('list.delete'), danger: true, onSelect: onDelete },
  ].map((item) => ({ ...item, key: `${item.key}-${list.id}` }));
}

/** An active list: title, progress and open count. */
export function ActiveListRow(props: ListRowProps): ReactNode {
  const { list, t, busy, reorder } = props;
  const open = list.total_tasks - list.completed_tasks;
  return (
    <li className="list-row">
      <Link className="list-row__name" to={`/lists/${list.id}`}>
        <span className="list-row__title">{list.title}</span>
        {list.subtitle !== null && <span className="list-row__subtitle">{list.subtitle}</span>}
      </Link>
      <span className="list-row__progress">
        <ProgressBar completed={list.completed_tasks} total={list.total_tasks} />
        <span className="list-row__count">
          {t('lists.progress.short', { completed: list.completed_tasks, total: list.total_tasks })}
        </span>
      </span>
      <span className="list-row__open">
        <span className="visually-hidden">{t('lists.column.open')}: </span>
        {open}
      </span>
      <span className="list-row__actions">
        {reorder && <ListMoves {...props} />}
        <OverflowMenu disabled={busy} items={rowMenu(props)} label={t('list.actions')} />
      </span>
    </li>
  );
}

/**
 * A list template: what it holds, and the one thing to do with it. The name
 * opens it for editing; Use template is a separate control, so using a
 * template never also opens it.
 */
export function TemplateRow(props: ListRowProps): ReactNode {
  const { list, t, busy, reorder, onCopy } = props;
  return (
    <li className="list-row list-row--template">
      <Link className="list-row__name" to={`/lists/${list.id}`}>
        <span className="list-row__title">{list.title}</span>
        <span className="list-row__subtitle">
          {list.subtitle === null
            ? t('lists.task_count', { count: list.total_tasks })
            : `${list.subtitle} · ${t('lists.task_count', { count: list.total_tasks })}`}
        </span>
      </Link>
      <span className="list-row__actions">
        {reorder && <ListMoves {...props} />}
        {onCopy !== undefined && !reorder && (
          <button
            aria-label={t('home.copy_template', { title: list.title })}
            className="button button--accent"
            disabled={busy}
            onClick={onCopy}
            type="button"
          >
            {t('lists.use_template')}
          </button>
        )}
        <OverflowMenu disabled={busy} items={rowMenu(props)} label={t('list.actions')} />
      </span>
    </li>
  );
}
