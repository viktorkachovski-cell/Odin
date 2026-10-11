import { useState, type ReactNode } from 'react';

import type { MemberDto, TaskDto } from '@odin/contracts';
import { keysAffectedByTaskChange, updateTask, useCommand } from '@odin/data';

import { useOdin } from '../app/OdinContext.ts';
import { useTaskQuery } from '../app/queries.ts';
import { Dialog } from './Dialog.tsx';
import { TaskDetailsDialog } from './TaskDetailsDialog.tsx';
import { TaskEditor } from './TaskEditor.tsx';

/**
 * Opening a task from any row: a side panel that is the editor itself, so
 * viewing and changing a task is one step rather than a read-only dialog
 * followed by a second form. A template task has no runtime fields and stays
 * read-only. A conflicting save keeps the member's draft and reloads the task,
 * so resubmitting targets the latest version -- the same flow as Android.
 */
export function TaskDetailsFlow({
  taskId,
  members,
  canEdit,
  onClose,
  onDelete,
}: {
  readonly taskId: string;
  readonly members: readonly MemberDto[];
  readonly canEdit: boolean;
  readonly onClose: () => void;
  /** Hands the loaded task back for the caller to confirm and delete. */
  readonly onDelete?: ((task: TaskDto) => void) | undefined;
}): ReactNode {
  const { t, locale, client } = useOdin();
  const task = useTaskQuery(taskId);
  // The version the draft was started from. Pinned on first load so a realtime
  // refetch mid-edit cannot quietly move the save onto a newer version; only an
  // explicit conflict review replaces it.
  const [base, setBase] = useState<TaskDto | null>(null);
  const loaded = task.isError ? undefined : task.data;
  if (base === null && loaded !== undefined) setBase(loaded);
  const save = useCommand(
    (
      requestId,
      input: {
        readonly taskId: string;
        readonly expectedVersion: number;
        readonly title: string;
        readonly notes: string;
        readonly assigneeId: string | null;
        readonly dueAt: string | null;
      },
    ) => updateTask(client, requestId, input),
    { invalidate: keysAffectedByTaskChange(), onSuccess: onClose },
  );

  if (!canEdit) {
    return (
      <TaskDetailsDialog
        canEdit={false}
        locale={locale}
        members={members}
        onClose={onClose}
        onEdit={() => undefined}
        t={t}
        taskId={taskId}
        variant="side"
      />
    );
  }

  const editing = base ?? loaded;
  if (editing === undefined) {
    return (
      <Dialog
        footer={
          <button className="button" onClick={onClose} type="button">
            {t('task.details.close')}
          </button>
        }
        onClose={onClose}
        title={t('task.details.title')}
        variant="side"
      >
        {task.isError ? (
          <div className="banner banner--danger" role="alert">
            <span className="banner__text">{t('task.details.error')}</span>
            <button className="button" onClick={() => void task.refetch()} type="button">
              {t('state.retry')}
            </button>
          </div>
        ) : (
          <p role="status">{t('task.details.loading')}</p>
        )}
      </Dialog>
    );
  }

  return (
    <TaskEditor
      conflict={save.state.error?.code === 'CONFLICT'}
      error={save.state.error}
      key={editing.id}
      members={members}
      onCancel={() => {
        save.reset();
        onClose();
      }}
      onDelete={onDelete === undefined ? undefined : () => onDelete(editing)}
      onReviewConflict={() => {
        save.reset();
        void task.refetch().then((result) => {
          if (result.data !== undefined) setBase(result.data);
        });
      }}
      onSubmit={(input) =>
        void save.run({ taskId: editing.id, expectedVersion: editing.version, ...input })
      }
      pending={save.state.pending}
      t={t}
      task={editing}
      variant="side"
    />
  );
}
