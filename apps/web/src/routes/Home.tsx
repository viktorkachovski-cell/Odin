import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';

import type { ListSummaryDto, MoveDirection } from '@odin/contracts';
import {
  copyTemplate,
  createList,
  deleteList,
  keysAffectedByListChange,
  keysAffectedByTaskChange,
  moveList,
  saveListTemplate,
  useCommand,
} from '@odin/data';
import { adjacentMoves } from '@odin/domain';
import type { Translator } from '@odin/i18n';

import { useOdin } from '../app/OdinContext.ts';
import { useHomeQuery } from '../app/queries.ts';
import { ErrorBanner } from '../components/Banner.tsx';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { Fab } from '../components/Fab.tsx';
import { ListEditor } from '../components/ListEditor.tsx';
import { OverflowMenu } from '../components/OverflowMenu.tsx';
import { Progress } from '../components/Progress.tsx';

/**
 * Home shows List templates and Active lists, split here from one `get_home`
 * read. Template cards keep their border; the copy control sits beside the
 * card's link rather than inside it. Create list in the header is the screen's
 * one solid primary, so copy is an outlined accent button.
 */

function ListCard({
  summary,
  t,
  busy,
  moveUpDisabled,
  moveDownDisabled,
  onMove,
  onDelete,
  onCopy,
  onSaveTemplate,
}: {
  readonly summary: ListSummaryDto;
  readonly t: Translator;
  readonly busy: boolean;
  readonly moveUpDisabled: boolean;
  readonly moveDownDisabled: boolean;
  readonly onMove: (direction: MoveDirection) => void;
  readonly onDelete: () => void;
  readonly onCopy?: (() => void) | undefined;
  readonly onSaveTemplate?: (() => void) | undefined;
}): ReactNode {
  const template = summary.kind === 'template';
  return (
    <li className={template ? 'card card--template' : 'card card--active'}>
      <div className="card__header">
        <div className="card__title-actions">
          {template ? (
            <span className="card__title">{summary.title}</span>
          ) : (
            <Link className="card__title" to={`/lists/${summary.id}`}>
              {summary.title}
            </Link>
          )}
          <ListOrderButtons
            disabled={busy}
            moveDownDisabled={moveDownDisabled}
            moveUpDisabled={moveUpDisabled}
            onMove={onMove}
            summary={summary}
            t={t}
          />
          {onSaveTemplate !== undefined && (
            <button
              aria-label={t('list.template.save_named', { title: summary.title })}
              className="button button--quiet template-save-icon"
              disabled={busy}
              onClick={onSaveTemplate}
              title={t('list.template.save_named', { title: summary.title })}
              type="button"
            >
              <span aria-hidden="true">⧉</span>
            </button>
          )}
        </div>
        <OverflowMenu
          disabled={busy}
          items={[
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
      </div>
      {summary.subtitle !== null && <span className="card__subtitle">{summary.subtitle}</span>}
      {summary.notes !== null && <p className="card__notes">{summary.notes}</p>}
      {onCopy !== undefined && (
        <div className="card__actions">
          <button className="button button--accent" disabled={busy} onClick={onCopy} type="button">
            {t('home.copy_template', { title: summary.title })}
          </button>
        </div>
      )}
      {!template && (
        <Progress completed={summary.completed_tasks} t={t} total={summary.total_tasks} />
      )}
    </li>
  );
}

function ListOrderButtons({
  summary,
  t,
  disabled,
  moveUpDisabled,
  moveDownDisabled,
  onMove,
}: {
  readonly summary: ListSummaryDto;
  readonly t: Translator;
  readonly disabled: boolean;
  readonly moveUpDisabled: boolean;
  readonly moveDownDisabled: boolean;
  readonly onMove: (direction: MoveDirection) => void;
}): ReactNode {
  return (
    <span className="order-buttons">
      <button
        aria-label={t('list.move.up', { title: summary.title })}
        className="button button--quiet order-buttons__button"
        disabled={disabled || moveUpDisabled}
        onClick={() => onMove('up')}
        type="button"
      >
        <span aria-hidden="true">↑</span>
      </button>
      <button
        aria-label={t('list.move.down', { title: summary.title })}
        className="button button--quiet order-buttons__button"
        disabled={disabled || moveDownDisabled}
        onClick={() => onMove('down')}
        type="button"
      >
        <span aria-hidden="true">↓</span>
      </button>
    </span>
  );
}

/** Lists move only among lists of their own kind. */
const byKind = (list: ListSummaryDto): string => list.kind;

export function Home(): ReactNode {
  const { t, client } = useOdin();
  const navigate = useNavigate();
  const home = useHomeQuery();
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ListSummaryDto | null>(null);
  const [templateSaved, setTemplateSaved] = useState(false);

  const copy = useCommand(
    (requestId, input: { readonly templateId: string }) =>
      copyTemplate(client, requestId, input.templateId),
    {
      invalidate: keysAffectedByTaskChange(),
      onSuccess: (listId) => {
        void navigate(`/lists/${listId}`);
      },
    },
  );

  const create = useCommand(
    (
      requestId,
      input: {
        readonly title: string;
        readonly subtitle: string | null;
        readonly notes: string | null;
      },
    ) => createList(client, requestId, input),
    {
      invalidate: keysAffectedByListChange(),
      onSuccess: () => setCreating(false),
    },
  );

  // A saved template is a new list, so Home is the only cache that changes.
  const saveTemplate = useCommand(
    (requestId, input: { readonly listId: string }) =>
      saveListTemplate(client, requestId, input.listId),
    {
      invalidate: keysAffectedByListChange(),
      onSuccess: () => setTemplateSaved(true),
    },
  );

  const reorderList = useCommand(
    (
      requestId,
      input: {
        readonly listId: string;
        readonly expectedVersion: number;
        readonly direction: MoveDirection;
      },
    ) => moveList(client, requestId, input),
    { invalidate: keysAffectedByListChange() },
  );

  const remove = useCommand(
    (requestId, input: { readonly listId: string; readonly expectedVersion: number }) =>
      deleteList(client, requestId, input),
    { invalidate: keysAffectedByListChange() },
  );

  if (home.isPending) return <p role="status">{t('state.loading')}</p>;

  if (home.isError) {
    return (
      <ErrorBanner
        error={{ code: 'UNKNOWN', message_key: 'error.unknown' }}
        onRetry={() => void home.refetch()}
        t={t}
      />
    );
  }

  const templates = home.data.items.filter((item) => item.kind === 'template');
  const active = home.data.items.filter((item) => item.kind === 'active');

  const section = (
    id: string,
    heading: string,
    empty: string,
    lists: readonly ListSummaryDto[],
    busy: boolean,
  ): ReactNode => (
    <section aria-labelledby={id} className="section">
      <h2 className="section__heading" id={id}>
        {heading}
      </h2>
      {lists.length === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        <ul className="card-grid">
          {lists.map((summary, index) => {
            const moves = adjacentMoves(lists, index, byKind);
            return (
              <ListCard
                busy={busy}
                key={summary.id}
                moveDownDisabled={!moves.down}
                moveUpDisabled={!moves.up}
                onCopy={
                  summary.kind === 'template'
                    ? () => void copy.run({ templateId: summary.id })
                    : undefined
                }
                onDelete={() => setPendingDelete(summary)}
                onMove={(direction) =>
                  void reorderList.run({
                    listId: summary.id,
                    expectedVersion: summary.version,
                    direction,
                  })
                }
                onSaveTemplate={
                  summary.kind === 'active'
                    ? () => {
                        setTemplateSaved(false);
                        void saveTemplate.run({ listId: summary.id });
                      }
                    : undefined
                }
                summary={summary}
                t={t}
              />
            );
          })}
        </ul>
      )}
    </section>
  );

  return (
    <>
      <div className="page-header">
        <h1>{t('home.title')}</h1>
        <button
          className="button button--primary page-header__primary"
          onClick={() => setCreating(true)}
          type="button"
        >
          {t('home.create_list')}
        </button>
      </div>

      {copy.state.error !== null && <ErrorBanner error={copy.state.error} t={t} />}
      {remove.state.error !== null && <ErrorBanner error={remove.state.error} t={t} />}
      {saveTemplate.state.error !== null && <ErrorBanner error={saveTemplate.state.error} t={t} />}
      {reorderList.state.error !== null && <ErrorBanner error={reorderList.state.error} t={t} />}
      {templateSaved && saveTemplate.state.error === null && (
        <p className="empty" role="status">
          {t('list.template.saved')}
        </p>
      )}

      {section(
        'templates-heading',
        t('home.templates.heading'),
        t('home.templates.empty'),
        templates,
        copy.state.pending || remove.state.pending || reorderList.state.pending,
      )}
      {section(
        'active-heading',
        t('home.active.heading'),
        t('home.active.empty'),
        active,
        remove.state.pending || saveTemplate.state.pending || reorderList.state.pending,
      )}

      <Fab label={t('home.create_list')} onClick={() => setCreating(true)} />

      {pendingDelete !== null && (
        <ConfirmDialog
          body={t('list.delete.confirm')}
          confirmLabel={t('list.delete')}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            void remove.run({
              listId: pendingDelete.id,
              expectedVersion: pendingDelete.version,
            });
            setPendingDelete(null);
          }}
          pending={remove.state.pending}
          t={t}
          title={t('list.delete.title')}
        />
      )}

      {creating && (
        <ListEditor
          error={create.state.error}
          list={null}
          onCancel={() => {
            create.reset();
            setCreating(false);
          }}
          onSubmit={(input) => void create.run(input)}
          pending={create.state.pending}
          t={t}
        />
      )}
    </>
  );
}
