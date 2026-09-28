import { useState, type ReactNode } from 'react';

import type { MemberDto, TaskDto } from '@odin/contracts';
import { keysAffectedByTaskChange, updateTask, useCommand } from '@odin/data';

import { useOdin } from '../app/OdinContext.ts';
import { useTaskQuery } from '../app/queries.ts';
import { TaskDetailsDialog } from './TaskDetailsDialog.tsx';
import { TaskEditor } from './TaskEditor.tsx';

/**
 * Opening a task from any row: its complete details, and for an active task
 * an editor in place. A conflicting save keeps the member's draft and reloads
 * the task, so resubmitting targets the latest version -- the same flow as the
 * Android client.
 */
export function TaskDetailsFlow({
  taskId,
  members,
  canEdit,
  onClose,
}: {
  readonly taskId: string;
  readonly members: readonly MemberDto[];
  readonly canEdit: boolean;
  readonly onClose: () => void;
}): ReactNode {
  const { t, locale, client } = useOdin();
  const task = useTaskQuery(taskId);
  const [editingTask, setEditingTask] = useState<TaskDto | null>(null);
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

  if (editingTask === null) {
    return (
      <TaskDetailsDialog
        canEdit={canEdit}
        locale={locale}
        members={members}
        onClose={onClose}
        onEdit={setEditingTask}
        t={t}
        taskId={taskId}
      />
    );
  }

  return (
    <TaskEditor
      conflict={save.state.error?.code === 'CONFLICT'}
      error={save.state.error}
      key={editingTask.id}
      members={members}
      onCancel={() => {
        save.reset();
        setEditingTask(null);
      }}
      onReviewConflict={() => {
        save.reset();
        void task.refetch().then((result) => {
          if (result.data !== undefined) setEditingTask(result.data);
        });
      }}
      onSubmit={(input) =>
        void save.run({ taskId: editingTask.id, expectedVersion: editingTask.version, ...input })
      }
      pending={save.state.pending}
      t={t}
      task={editingTask}
    />
  );
}
