import { useState, type ReactNode } from 'react';

import type { TaskDto } from '@odin/contracts';
import { keysAffectedByTaskChange, updateTask, useCommand } from '@odin/data';
import type { MemberDto } from '@odin/contracts';

import { useOdin } from '../state/OdinContext.ts';
import { useTaskQuery } from '../state/queries.ts';
import { TaskEditor } from './TaskEditor.tsx';
import {
  TaskDetailsErrorSheet,
  TaskDetailsLoadingSheet,
  TaskDetailsSheet,
} from './TaskDetailsSheet.tsx';

export function TaskDetailsFlow({
  taskId,
  members,
  onClose,
}: {
  readonly taskId: string | null;
  readonly members: readonly MemberDto[];
  readonly onClose: () => void;
}): ReactNode {
  const { t, locale, client } = useOdin();
  const task = useTaskQuery(taskId, taskId !== null);
  const [editingTask, setEditingTask] = useState<TaskDto | null>(null);
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
  if (task.isPending) {
    return <TaskDetailsLoadingSheet onClose={onClose} t={t} />;
  }
  if (task.isError || task.data === undefined) {
    return <TaskDetailsErrorSheet onClose={onClose} onRetry={() => void task.refetch()} t={t} />;
  }

  const selected = task.data;
  if (editingTask !== null) {
    return (
      <TaskEditor
        conflict={save.state.error?.code === 'CONFLICT'}
        error={save.state.error}
        key={editingTask.id}
        locale={locale}
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
          void save.run({
            taskId: editingTask.id,
            expectedVersion: editingTask.version,
            title: input.title,
            notes: input.notes,
            assigneeId: input.assigneeId,
            dueAt: input.dueAt,
          })
        }
        pending={save.state.pending}
        t={t}
        task={editingTask}
      />
    );
  }

  return (
    <TaskDetailsSheet
      editable
      locale={locale}
      members={members}
      onClose={onClose}
      onEdit={() => setEditingTask(selected)}
      t={t}
      task={selected}
    />
  );
}
