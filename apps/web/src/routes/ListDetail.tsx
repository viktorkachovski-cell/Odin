import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { useListActions } from '@odin/data';
import { sortTasksInList } from '@odin/domain';
import { progressText } from '@odin/i18n';

import { useOdin } from '../app/OdinContext.ts';
import { useListQuery, useMembersQuery } from '../app/queries.ts';
import {
  CommandErrors,
  DestructiveConfirm,
  ListHeader,
  ListTasks,
  QuickAdd,
  type PendingConfirm,
} from '../components/ListDetailParts.tsx';
import { ListEditor } from '../components/ListEditor.tsx';
import { TemplateSavedToast } from '../components/Toast.tsx';
import { useTaskWiring } from '../components/useTaskWiring.tsx';
import { ProgressBar } from './ListsParts.tsx';

/**
 * List detail: header, progress, the shared note, then the tasks with a quick
 * add on top. Totals come from the server's whole-list counts.
 */

export function ListDetail(): ReactNode {
  const { listId } = useParams<{ listId: string }>();
  const { t, locale, client } = useOdin();
  const navigate = useNavigate();
  const list = useListQuery(listId);
  const members = useMembersQuery();
  const memberList = members.data ?? [];
  const isTemplate = list.data?.list.kind === 'template';
  const wiring = useTaskWiring({ members: memberList, listId, textOnly: isTemplate });

  const [editingList, setEditingList] = useState(false);
  const [reorder, setReorder] = useState(false);
  const [confirming, setConfirming] = useState<PendingConfirm | null>(null);
  const [toast, setToast] = useState(false);
  const {
    update: saveList,
    saveTemplate,
    remove: removeList,
    removeDone,
    addTask,
  } = useListActions(client, listId, {
    templateSaved: () => setToast(true),
    deleted: () => void navigate('/lists'),
  });

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
        onSaveTemplate={() => void saveTemplate.run(page.list.id)}
        onToggleReorder={() => setReorder((current) => !current)}
        pending={removeList.state.pending || saveTemplate.state.pending}
        reorder={reorder}
        subtitle={page.list.subtitle}
        t={t}
        title={page.list.title}
      >
        {!isTemplate && (
          <div className="list-progress-line">
            <ProgressBar completed={page.completed_tasks} total={page.total_tasks} />
            <span className="list-progress-line__label">
              {progressText(t, page.completed_tasks, page.total_tasks, page.progress_percent)}
            </span>
          </div>
        )}
      </ListHeader>

      {wiring.errors}
      <CommandErrors
        errors={[
          { error: removeList.state.error, retry: () => void removeList.retry() },
          { error: saveTemplate.state.error, retry: () => void saveTemplate.retry() },
          { error: removeDone.state.error, retry: () => void removeDone.retry() },
        ]}
        t={t}
      />

      <ListTasks
        before={
          <QuickAdd
            error={addTask.state.error}
            onAdd={(title, done) =>
              void addTask.run(title).then((result) => {
                if (result.ok) done();
              })
            }
            pending={addTask.state.pending}
            t={t}
          />
        }
        busy={wiring.actions.busy || removeDone.state.pending}
        handlers={wiring.handlers}
        isTemplate={isTemplate}
        locale={locale}
        members={memberList}
        onDeleteDone={
          isTemplate
            ? undefined
            : (done) =>
                setConfirming({
                  titleKey: 'list.delete_done.title',
                  bodyKey: 'list.delete_done.confirm',
                  confirmKey: 'list.delete_done',
                  run: () => void removeDone.run(done),
                })
        }
        onMoveTask={wiring.actions.move}
        reorder={reorder}
        t={t}
        tasks={ordered}
      />
      {ordered.length === 0 && <p className="empty">{t('list.empty')}</p>}

      <DestructiveConfirm
        confirm={confirming}
        onClose={() => setConfirming(null)}
        pending={removeList.state.pending || removeDone.state.pending}
        t={t}
      />
      {wiring.overlays}

      {toast && <TemplateSavedToast onDismiss={() => setToast(false)} t={t} />}

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
