import type { ReactNode } from 'react';

import type { MemberDto, TaskDto } from '@odin/contracts';
import { createTask, keysAffectedByTaskChange, updateTask, useCommand } from '@odin/data';

import { useOdin } from '../app/OdinContext.ts';
import { TaskEditor } from './TaskEditor.tsx';

/**
 * Adding a task to a list, or editing one from its row. `task` null means a
 * new task; the component is keyed by task so each edit starts a fresh
 * command and draft.
 */
export function ListTaskEditor({
  listId,
  task,
  members,
  onClose,
  onReviewConflict,
}: {
  readonly listId: string;
  readonly task: TaskDto | null;
  readonly members: readonly MemberDto[];
  readonly onClose: () => void;
  readonly onReviewConflict: () => void;
}): ReactNode {
  const { t, client } = useOdin();
  const save = useCommand(
    (
      requestId,
      input: {
        readonly title: string;
        readonly notes: string;
        readonly assigneeId: string | null;
        readonly dueAt: string | null;
      },
    ) =>
      task === null
        ? createTask(client, requestId, { listId, ...input })
        : updateTask(client, requestId, {
            taskId: task.id,
            expectedVersion: task.version,
            ...input,
          }),
    { invalidate: keysAffectedByTaskChange(listId), onSuccess: onClose },
  );

  return (
    <TaskEditor
      conflict={save.state.error?.code === 'CONFLICT'}
      error={save.state.error}
      members={members}
      onCancel={() => {
        save.reset();
        onClose();
      }}
      onReviewConflict={() => {
        save.reset();
        onReviewConflict();
      }}
      onSubmit={(input) => void save.run(input)}
      pending={save.state.pending}
      t={t}
      task={task}
    />
  );
}
