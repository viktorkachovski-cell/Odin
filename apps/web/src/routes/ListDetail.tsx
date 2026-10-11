import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import {
  createTask,
  deleteList,
  keysAffectedByListChange,
  keysAffectedByTaskChange,
  saveListTemplate,
  updateList,
  useCommand,
} from '@odin/data';
import { sortTasksInList } from '@odin/domain';

import { useOdin } from '../app/OdinContext.ts';
import { useListQuery, useMembersQuery } from '../app/queries.ts';
import {
  anyPending,
  CommandErrors,
  DestructiveConfirm,
  ListHeader,
  ListTasks,
  QuickAdd,
  type PendingConfirm,
} from '../components/ListDetailParts.tsx';
import { ListEditor } from '../components/ListEditor.tsx';
import { Toast } from '../components/Toast.tsx';
import { useTaskWiring } from '../components/useTaskWiring.tsx';
import { ProgressBar } from './ListsParts.tsx';

/**
 * List detail: header, progress, the shared note, then the tasks with a quick
 * add on top. Totals come from the server's whole-list counts. Editing a task
 * happens in the task panel opened from its title.
 */

function useListCommands(listId: string | undefined, onTemplateSaved: () => void) {
  const { client } = useOdin();
  const navigate = useNavigate();
  const saveList = useCommand(
    (
      requestId,
      input: {
        readonly expectedVersion: number;
        readonly title: string;
        readonly subtitle: string | null;
        readonly notes: string | null;
      },
    ) => updateList(client, requestId, { listId: listId ?? '', ...input }),
    { invalidate: keysAffectedByListChange(listId) },
  );
  const saveTemplate = useCommand(
    (requestId, input: { readonly listId: string }) =>
      saveListTemplate(client, requestId, input.listId),
    { invalidate: keysAffectedByListChange(), onSuccess: onTemplateSaved },
  );
  const removeList = useCommand(
    (requestId, input: { readonly listId: string; readonly expectedVersion: number }) =>
      deleteList(client, requestId, input),
    { invalidate: keysAffectedByListChange(listId), onSuccess: () => void navigate('/lists') },
  );
  const addTask = useCommand(
    (requestId, input: { readonly title: string }) =>
      createTask(client, requestId, { listId: listId ?? '', title: input.title, notes: '' }),
    { invalidate: keysAffectedByTaskChange(listId) },
  );
  return { saveList, saveTemplate, removeList, addTask };
}

export function ListDetail(): ReactNode {
  const { listId } = useParams<{ listId: string }>();
  const { t, locale } = useOdin();
  const list = useListQuery(listId);
  const members = useMembersQuery();
  const memberList = members.data ?? [];
  const isTemplate = list.data?.list.kind === 'template';
  const wiring = useTaskWiring({ members: memberList, listId, canEdit: !isTemplate });

  const [editingList, setEditingList] = useState(false);
  const [reorder, setReorder] = useState(false);
  const [confirming, setConfirming] = useState<PendingConfirm | null>(null);
  const [toast, setToast] = useState(false);
  const { saveList, saveTemplate, removeList, addTask } = useListCommands(listId, () =>
    setToast(true),
  );

  if (list.isPending) return <p role="status">{t('state.loading')}</p>;
  if (!list.data) {
    return (
      <>
        <p className="empty">{t('list.not_found')}</p>
        <Link className="button" to="/lists">
          {t('lists.title')}
        </Link>
      </>
    );
  }

  const page = list.data;
  const ordered = sortTasksInList(page.tasks);

  return (
    <>
      <ListHeader
        canReorder={ordered.length > 1}
        isTemplate={isTemplate}
        notes={page.list.notes}
        onDelete={() =>
          setConfirming({
            titleKey: 'list.delete.title',
            bodyKey: 'list.delete.confirm',
            confirmKey: 'list.delete',
            run: () =>
              void removeList.run({ listId: page.list.id, expectedVersion: page.list.version }),
          })
        }
        onEdit={() => setEditingList(true)}
        onSaveTemplate={() => void saveTemplate.run({ listId: page.list.id })}
        onToggleReorder={() => setReorder((current) => !current)}
        pending={anyPending([removeList.state, saveTemplate.state])}
        reorder={reorder}
        subtitle={page.list.subtitle}
        t={t}
        title={page.list.title}
      >
        {!isTemplate && (
          <div className="list-progress-line">
            <ProgressBar completed={page.completed_tasks} total={page.total_tasks} />
            <span className="list-progress-line__label">
              {page.total_tasks === 0
                ? t('home.progress.empty')
                : t('home.progress', {
                    completed: page.completed_tasks,
                    total: page.total_tasks,
                    percent: page.progress_percent,
                  })}
            </span>
          </div>
        )}
      </ListHeader>

      {wiring.errors}
      <CommandErrors
        errors={[
          { error: removeList.state.error, retry: () => void removeList.retry() },
          { error: saveTemplate.state.error, retry: () => void saveTemplate.retry() },
        ]}
        t={t}
      />

      <ListTasks
        before={
          isTemplate ? undefined : (
            <QuickAdd
              error={addTask.state.error}
              onAdd={(title, done) =>
                void addTask.run({ title }).then((result) => {
                  if (result.ok) done();
                })
              }
              pending={addTask.state.pending}
              t={t}
            />
          )
        }
        busy={wiring.actions.busy}
        handlers={wiring.handlers}
        isTemplate={isTemplate}
        locale={locale}
        members={memberList}
        onMoveTask={wiring.actions.move}
        reorder={reorder}
        t={t}
        tasks={ordered}
      />
      {ordered.length === 0 && <p className="empty">{t('list.empty')}</p>}

      <DestructiveConfirm
        confirm={confirming}
        onClose={() => setConfirming(null)}
        pending={removeList.state.pending}
        t={t}
      />
      {wiring.overlays}

      {toast && (
        <Toast
          action={{ label: t('toast.view'), to: '/lists?tab=templates' }}
          message={t('toast.template_saved')}
          onDismiss={() => setToast(false)}
        />
      )}

      {editingList && (
        <ListEditor
          error={saveList.state.error}
          list={page.list}
          onCancel={() => {
            saveList.reset();
            setEditingList(false);
          }}
          onSubmit={(input) =>
            void saveList.run({ expectedVersion: page.list.version, ...input }).then((result) => {
              if (result.ok) setEditingList(false);
            })
          }
          pending={saveList.state.pending}
          t={t}
        />
      )}
    </>
  );
}
