import type { ReactNode } from 'react';
import { Link } from 'react-router';

import type { ListSummaryDto, MoveDirection } from '@odin/contracts';
import { progressPercent } from '@odin/domain';
import type { Translator } from '@odin/i18n';

import { Icon } from '../components/Icon.tsx';
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

function MoveButtons({
  list,
  t,
  busy,
  moveUpDisabled,
  moveDownDisabled,
  onMove,
}: {
  readonly list: ListSummaryDto;
  readonly t: Translator;
  readonly busy: boolean;
  readonly moveUpDisabled: boolean;
  readonly moveDownDisabled: boolean;
  readonly onMove: (direction: MoveDirection) => void;
}): ReactNode {
  return (
    <>
      <button
        aria-label={t('list.move.up', { title: list.title })}
        className="button button--quiet button--icon"
        disabled={busy || moveUpDisabled}
        onClick={() => onMove('up')}
        type="button"
      >
        <Icon name="arrow-up" />
      </button>
      <button
        aria-label={t('list.move.down', { title: list.title })}
        className="button button--quiet button--icon"
        disabled={busy || moveDownDisabled}
        onClick={() => onMove('down')}
        type="button"
      >
        <Icon name="arrow-down" />
      </button>
    </>
  );
}

export interface ListRowProps {
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
        {reorder && <MoveButtons {...props} />}
        <OverflowMenu disabled={busy} items={rowMenu(props)} label={t('list.actions')} />
      </span>
    </li>
  );
}

/** A list template: what it holds, and the one thing to do with it. */
export function TemplateRow(props: ListRowProps): ReactNode {
  const { list, t, busy, reorder, onCopy } = props;
  return (
    <li className="list-row list-row--template">
      <span className="list-row__name">
        <span className="list-row__title">{list.title}</span>
        <span className="list-row__subtitle">
          {list.subtitle === null
            ? t('lists.task_count', { count: list.total_tasks })
            : `${list.subtitle} · ${t('lists.task_count', { count: list.total_tasks })}`}
        </span>
      </span>
      <span className="list-row__actions">
        {reorder && <MoveButtons {...props} />}
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
