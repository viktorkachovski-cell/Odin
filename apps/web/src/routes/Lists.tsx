import { useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

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

import { useOdin } from '../app/OdinContext.ts';
import { useHomeQuery } from '../app/queries.ts';
import { ErrorBanner } from '../components/Banner.tsx';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { Fab } from '../components/Fab.tsx';
import { Icon } from '../components/Icon.tsx';
import { ListEditor } from '../components/ListEditor.tsx';
import { OverflowMenu } from '../components/OverflowMenu.tsx';
import { Toast } from '../components/Toast.tsx';
import { ActiveListRow, TemplateRow } from './ListsParts.tsx';

/**
 * Lists: active lists and list templates as two tabs of one table. A template
 * is used from the New list menu or its own row; it no longer occupies the top
 * of the first screen. Reordering is a mode, so the arrows are not on every row
 * all the time.
 */

const byKind = (list: ListSummaryDto): string => list.kind;

function useListCommands(onTemplateSaved: () => void) {
  const { client } = useOdin();
  const navigate = useNavigate();
  const copy = useCommand(
    (requestId, input: { readonly templateId: string }) =>
      copyTemplate(client, requestId, input.templateId),
    {
      invalidate: keysAffectedByTaskChange(),
      onSuccess: (listId) => void navigate(`/lists/${listId}`),
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
      onSuccess: (list) => void navigate(`/lists/${list.id}`),
    },
  );
  const saveTemplate = useCommand(
    (requestId, input: { readonly listId: string }) =>
      saveListTemplate(client, requestId, input.listId),
    { invalidate: keysAffectedByListChange(), onSuccess: onTemplateSaved },
  );
  const reorder = useCommand(
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
  return { copy, create, saveTemplate, reorder, remove };
}

export function Lists(): ReactNode {
  const { t } = useOdin();
  const home = useHomeQuery();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'templates' ? 'templates' : 'active';
  const [creating, setCreating] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ListSummaryDto | null>(null);
  const [toast, setToast] = useState(false);
  const commands = useListCommands(() => setToast(true));
  const { copy, create, saveTemplate, reorder, remove } = commands;

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
  const shown = tab === 'templates' ? templates : active;
  const busy = [copy, saveTemplate, reorder, remove].some((command) => command.state.pending);
  const errors = [copy, create, saveTemplate, reorder, remove].flatMap((command) =>
    command.state.error === null || command === create ? [] : [command.state.error],
  );
  const selectTab = (next: 'active' | 'templates'): void => {
    setReordering(false);
    setParams(next === 'templates' ? { tab: 'templates' } : {});
  };

  return (
    <>
      <div className="page-header">
        <h1>{t('lists.title')}</h1>
        <div className="split-button page-header__primary">
          <button
            className="button button--primary split-button__main"
            onClick={() => setCreating(true)}
            type="button"
          >
            <Icon name="plus" size={18} />
            {t('lists.new')}
          </button>
          {templates.length > 0 && (
            <OverflowMenu
              disabled={busy}
              heading={t('lists.from_template.heading')}
              items={templates.map((template) => ({
                key: template.id,
                label: template.title,
                description: t('lists.task_count', { count: template.total_tasks }),
                onSelect: () => void copy.run({ templateId: template.id }),
              }))}
              label={t('lists.from_template')}
              trigger={<Icon name="chevron-down" size={18} />}
              triggerClassName="button button--primary split-button__more"
            />
          )}
        </div>
      </div>

      {errors.map((error, index) => (
        <ErrorBanner error={error} key={`${error.message_key}-${index}`} t={t} />
      ))}

      <div className="toolbar">
        <div aria-label={t('lists.tab.label')} className="segmented" role="group">
          <button
            aria-pressed={tab === 'active'}
            className="segmented__option"
            onClick={() => selectTab('active')}
            type="button"
          >
            {t('lists.tab.active')} <span className="segmented__count">{active.length}</span>
          </button>
          <button
            aria-pressed={tab === 'templates'}
            className="segmented__option"
            onClick={() => selectTab('templates')}
            type="button"
          >
            {t('lists.tab.templates')} <span className="segmented__count">{templates.length}</span>
          </button>
        </div>
        {shown.length > 1 && (
          <button
            aria-pressed={reordering}
            className="button button--quiet"
            onClick={() => setReordering((current) => !current)}
            type="button"
          >
            <Icon name="reorder" size={18} />
            {reordering ? t('lists.reorder.done') : t('lists.reorder')}
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="empty">
          {tab === 'templates' ? t('lists.templates.empty') : t('home.active.empty')}
        </p>
      ) : (
        <div className="surface">
          {tab === 'active' && (
            <div aria-hidden="true" className="list-table__header">
              <span>{t('lists.column.list')}</span>
              <span>{t('lists.column.progress')}</span>
              <span>{t('lists.column.open')}</span>
              <span />
            </div>
          )}
          <ul className="list-table">
            {shown.map((list, index) => {
              const moves = adjacentMoves(shown, index, byKind);
              const Row = tab === 'templates' ? TemplateRow : ActiveListRow;
              return (
                <Row
                  busy={busy}
                  key={list.id}
                  list={list}
                  moveDownDisabled={!moves.down}
                  moveUpDisabled={!moves.up}
                  onCopy={() => void copy.run({ templateId: list.id })}
                  onDelete={() => setPendingDelete(list)}
                  onMove={(direction) =>
                    void reorder.run({
                      listId: list.id,
                      expectedVersion: list.version,
                      direction,
                    })
                  }
                  onSaveTemplate={
                    tab === 'active' ? () => void saveTemplate.run({ listId: list.id }) : undefined
                  }
                  reorder={reordering}
                  t={t}
                />
              );
            })}
          </ul>
        </div>
      )}

      <Fab label={t('lists.new')} onClick={() => setCreating(true)} />

      {toast && (
        <Toast
          action={{ label: t('toast.view'), to: '/lists?tab=templates' }}
          message={t('toast.template_saved')}
          onDismiss={() => setToast(false)}
        />
      )}

      {pendingDelete !== null && (
        <ConfirmDialog
          body={t('list.delete.confirm')}
          confirmLabel={t('list.delete')}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => {
            void remove.run({ listId: pendingDelete.id, expectedVersion: pendingDelete.version });
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
