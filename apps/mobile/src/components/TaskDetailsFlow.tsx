import { useState, type ReactNode } from 'react';

import type { MemberDto, TaskDto } from '@odin/contracts';
import { keysAffectedByTaskChange, updateTask, useCommand } from '@odin/data';

import { useOdin } from '../state/OdinContext.ts';
import { useTaskQuery } from '../state/queries.ts';
import { TaskEditor } from './TaskEditor.tsx';
import {
  TaskDetailsErrorSheet,
  TaskDetailsLoadingSheet,
  TaskDetailsSheet,
} from './TaskDetailsSheet.tsx';

/**
 * Opening a task from any row. An active task opens straight into its editor,
 * so viewing and changing it is one step; a template task has no runtime
 * fields and stays a read-only sheet. A conflicting save keeps the member's
 * draft and reloads the task, so resubmitting targets the latest version --
 * the same flow as the web client.
 */
export function TaskDetailsFlow({
  taskId,
  members,
  editable,
  onClose,
  onDelete,
}: {
  readonly taskId: string | null;
  readonly members: readonly MemberDto[];
  readonly editable: boolean;
  readonly onClose: () => void;
  /** Hands the loaded task back for the caller to confirm and delete. */
  readonly onDelete?: ((task: TaskDto) => void) | undefined;
}): ReactNode {
  const { t, locale, client } = useOdin();
  const task = useTaskQuery(taskId);
  // The version the draft started from. Pinned on first load so a realtime
  // refetch mid-edit cannot quietly move the save onto a newer version; only an
  // explicit conflict review replaces it.
  const [base, setBase] = useState<TaskDto | null>(null);
  const loaded = task.isError ? undefined : task.data;
  if (editable && base === null && loaded !== undefined) setBase(loaded);
  const save = useCommand(
    (
      requestId,
      input: {
        readonly taskId: string;
        readonly expectedVersion: number;
        readonly title: string;
        readonly notes: string | null;
        readonly assigneeId: string | null;
        readonly dueAt: string | null;
      },
    ) => updateTask(client, requestId, input),
    {
      invalidate: keysAffectedByTaskChange(),
      onSuccess: onClose,
    },
  );

  if (taskId === null) return null;
  const editing = base ?? loaded;
  if (editing === undefined) {
    return task.isError ? (
      <TaskDetailsErrorSheet onClose={onClose} onRetry={() => void task.refetch()} t={t} />
    ) : (
      <TaskDetailsLoadingSheet onClose={onClose} t={t} />
    );
  }

  if (!editable) {
    return (
      <TaskDetailsSheet
        editable={false}
        locale={locale}
        members={members}
        onClose={onClose}
        onEdit={() => undefined}
        t={t}
        task={editing}
      />
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
    />
  );
}
