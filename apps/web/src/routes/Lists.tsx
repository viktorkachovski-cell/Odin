import { useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import type { ListSummaryDto } from '@odin/contracts';
import { useListActions } from '@odin/data';
import { adjacentMoves, canReorderLists } from '@odin/domain';

import { useOdin } from '../app/OdinContext.ts';
import { useHomeQuery, useProjectsQuery } from '../app/queries.ts';
import { ErrorBanner, LoadFailure } from '../components/Banner.tsx';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { Fab } from '../components/Fab.tsx';
import { ListEditor } from '../components/ListEditor.tsx';
import { TemplateSavedToast } from '../components/Toast.tsx';
import { ListsHeader, ListsToolbar, type ListsTab } from './ListsChrome.tsx';
import { ActiveListRow, TemplateRow } from './ListsParts.tsx';
import { ListsBody } from './ProjectSections.tsx';
import { useProjectDialogs } from './useProjectDialogs.tsx';

/**
 * Lists: active lists and list templates as two tabs of one table. A template
 * is used from the New list menu or its own row. Reordering is a mode, so the
 * arrows are not on every row all the time.
 *
 * Once the household has a project, the Active tab groups its lists under
 * their projects. Templates are never in a project.
 */

const byKind = (list: ListSummaryDto): string => list.kind;

export function Lists(): ReactNode {
  const { t, client } = useOdin();
  const navigate = useNavigate();
  const home = useHomeQuery();
  const projectsQuery = useProjectsQuery();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'templates' ? 'templates' : 'active';
  /** The project a new list starts in; null while the editor is closed. */
  const [creating, setCreating] = useState<{ readonly projectId: string | null } | null>(null);
  const [reordering, setReordering] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ListSummaryDto | null>(null);
  const [toast, setToast] = useState(false);
  const { copy, create, saveTemplate, move, remove } = useListActions(client, undefined, {
    opened: (listId) => void navigate(`/lists/${listId}`),
    templateSaved: () => setToast(true),
  });
  const projects = projectsQuery.data?.items ?? [];
  const projectUi = useProjectDialogs(projects);

  if (home.isPending) return <p role="status">{t('state.loading')}</p>;
  if (home.isError) return <LoadFailure onRetry={() => void home.refetch()} t={t} />;

  const templates = home.data.items.filter((item) => item.kind === 'template');
  const active = home.data.items.filter((item) => item.kind === 'active');
  const shown = tab === 'templates' ? templates : active;
  const canReorder = canReorderLists({
    tab,
    shownCount: shown.length,
    projectsKnown: projectsQuery.isSuccess,
  });
  const commands = [copy, saveTemplate, move, remove];
  const busy = projectUi.busy || commands.some((command) => command.state.pending);
  const errors = [
    ...commands.flatMap((command) => (command.state.error === null ? [] : [command.state.error])),
    ...projectUi.errors,
  ];
  const selectTab = (next: ListsTab): void => {
    setReordering(false);
    setParams(next === 'templates' ? { tab: 'templates' } : {});
  };

  /** Rows for one group; a move only ever swaps within its own group. */
  const renderRows = (rows: readonly ListSummaryDto[]): ReactNode =>
    rows.map((list, index) => {
      const moves = adjacentMoves(rows, index, byKind);
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
            void move.run({ listId: list.id, expectedVersion: list.version, direction })
          }
          onMoveToProject={
            tab === 'active' && projects.length > 0 ? () => projectUi.moveList(list) : undefined
          }
          onSaveTemplate={tab === 'active' ? () => void saveTemplate.run(list.id) : undefined}
          reorder={reordering && canReorder}
          t={t}
        />
      );
    });

  return (
    <>
      <ListsHeader
        busy={busy}
        onNewList={() => setCreating({ projectId: null })}
        onUseTemplate={(template) => void copy.run(template.id)}
        t={t}
        templates={templates}
      />

      {errors.map((error, index) => (
        <ErrorBanner error={error} key={`${error.message_key}-${index}`} t={t} />
      ))}
      {projectsQuery.isError && <LoadFailure onRetry={() => void projectsQuery.refetch()} t={t} />}

      <ListsToolbar
        activeCount={active.length}
        busy={busy}
        onNewProject={projectUi.newProject}
        onTab={selectTab}
        onToggleReorder={() => setReordering((current) => !current)}
        reorderable={canReorder}
        reordering={reordering}
        t={t}
        tab={tab}
        templateCount={templates.length}
      />

      <ListsBody
        active={active}
        busy={busy}
        onAddList={(project) => setCreating({ projectId: project.id })}
        onDelete={projectUi.deleteProject}
        onRename={projectUi.renameProject}
        projects={projects}
        renderRows={renderRows}
        shown={shown}
        t={t}
        tab={tab}
      />

      <Fab label={t('lists.new')} onClick={() => setCreating({ projectId: null })} />

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

      {projectUi.dialogs}

      {creating !== null && (
        <ListEditor
          error={create.state.error}
          initialProjectId={creating.projectId}
          list={null}
          onCancel={() => {
            create.reset();
            setCreating(null);
          }}
          onSubmit={(input) => void create.run(input)}
          pending={create.state.pending}
          projects={projects}
          t={t}
        />
      )}
    </>
  );
}
