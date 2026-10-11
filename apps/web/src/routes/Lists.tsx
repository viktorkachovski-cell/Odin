import { useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import type { ListSummaryDto } from '@odin/contracts';
import { useListActions } from '@odin/data';
import { adjacentMoves } from '@odin/domain';

import { useOdin } from '../app/OdinContext.ts';
import { useHomeQuery } from '../app/queries.ts';
import { ErrorBanner, LoadFailure } from '../components/Banner.tsx';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { ReorderToggle, Segmented } from '../components/Controls.tsx';
import { Fab } from '../components/Fab.tsx';
import { Icon } from '../components/Icon.tsx';
import { ListEditor } from '../components/ListEditor.tsx';
import { OverflowMenu } from '../components/OverflowMenu.tsx';
import { TemplateSavedToast } from '../components/Toast.tsx';
import { ActiveListRow, TemplateRow } from './ListsParts.tsx';

/**
 * Lists: active lists and list templates as two tabs of one table. A template
 * is used from the New list menu or its own row. Reordering is a mode, so the
 * arrows are not on every row all the time.
 */

const byKind = (list: ListSummaryDto): string => list.kind;

export function Lists(): ReactNode {
  const { t, client } = useOdin();
  const navigate = useNavigate();
  const home = useHomeQuery();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'templates' ? 'templates' : 'active';
  const [creating, setCreating] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ListSummaryDto | null>(null);
  const [toast, setToast] = useState(false);
  const { copy, create, saveTemplate, move, remove } = useListActions(client, undefined, {
    opened: (listId) => void navigate(`/lists/${listId}`),
    templateSaved: () => setToast(true),
  });

  if (home.isPending) return <p role="status">{t('state.loading')}</p>;
  if (home.isError) return <LoadFailure onRetry={() => void home.refetch()} t={t} />;

  const templates = home.data.items.filter((item) => item.kind === 'template');
  const active = home.data.items.filter((item) => item.kind === 'active');
  const shown = tab === 'templates' ? templates : active;
  const busy = [copy, saveTemplate, move, remove].some((command) => command.state.pending);
  const errors = [copy, saveTemplate, move, remove].flatMap((command) =>
    command.state.error === null ? [] : [command.state.error],
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
                onSelect: () => void copy.run(template.id),
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
        <Segmented
          label={t('lists.tab.label')}
          onChange={selectTab}
          options={[
            { key: 'active', label: t('lists.tab.active'), count: active.length },
            { key: 'templates', label: t('lists.tab.templates'), count: templates.length },
          ]}
          value={tab}
        />
        {shown.length > 1 && (
          <ReorderToggle
            on={reordering}
            onToggle={() => setReordering((current) => !current)}
            t={t}
          />
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
                  onCopy={() => void copy.run(list.id)}
                  onDelete={() => setPendingDelete(list)}
                  onMove={(direction) =>
                    void move.run({
                      listId: list.id,
                      expectedVersion: list.version,
                      direction,
                    })
                  }
                  onSaveTemplate={
                    tab === 'active' ? () => void saveTemplate.run(list.id) : undefined
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

      {toast && <TemplateSavedToast onDismiss={() => setToast(false)} t={t} />}

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
