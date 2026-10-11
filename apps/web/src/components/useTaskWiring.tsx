import { useState, type ReactNode } from 'react';

import { taskRowFromTask, type MemberDto, type TaskRowModel } from '@odin/contracts';
import { useTaskRowActions, type TaskRowActions } from '@odin/data';

import { useOdin } from '../app/OdinContext.ts';
import { CommandErrors, DestructiveConfirm, type PendingConfirm } from './ListDetailParts.tsx';
import { TaskDetailsFlow } from './TaskDetailsFlow.tsx';

/**
 * Every screen that shows task rows wires them the same way: the shared row
 * commands, the task panel, and confirmation before Unassign or Delete. One
 * hook keeps Today, Tasks and list detail from drifting apart.
 */

export interface TaskRowHandlers {
  readonly busy: boolean;
  readonly onToggleCompleted: TaskRowActions['toggleCompleted'];
  readonly onSetState: TaskRowActions['setState'];
  readonly onClaim: TaskRowActions['claim'];
  readonly onOpenDetails: (task: TaskRowModel) => void;
  readonly onUnassign: (task: TaskRowModel) => void;
  readonly onDelete: (task: TaskRowModel) => void;
}

export function useTaskWiring({
  members,
  listId,
  canEdit = true,
}: {
  readonly members: readonly MemberDto[];
  readonly listId?: string | undefined;
  readonly canEdit?: boolean;
}): {
  readonly actions: TaskRowActions;
  readonly handlers: TaskRowHandlers;
  readonly errors: ReactNode;
  readonly overlays: ReactNode;
} {
  const { t, client } = useOdin();
  const actions = useTaskRowActions(client, listId);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

  const confirmDelete = (task: TaskRowModel): void =>
    setConfirm({
      titleKey: 'task.delete.title',
      bodyKey: 'task.delete.confirm',
      confirmKey: 'task.delete.short',
      run: () => actions.remove(task),
    });

  const handlers: TaskRowHandlers = {
    busy: actions.busy,
    onToggleCompleted: actions.toggleCompleted,
    onSetState: actions.setState,
    onClaim: actions.claim,
    onOpenDetails: (task) => setDetailsId(task.id),
    onUnassign: (task) =>
      setConfirm({
        titleKey: 'task.unassign.title',
        bodyKey: 'task.unassign.confirm',
        confirmKey: 'task.unassign.short',
        run: () => actions.unassign(task),
      }),
    onDelete: confirmDelete,
  };

  const overlays = (
    <>
      <DestructiveConfirm
        confirm={confirm}
        onClose={() => setConfirm(null)}
        pending={actions.busy}
        t={t}
      />
      {detailsId !== null && (
        <TaskDetailsFlow
          canEdit={canEdit}
          members={members}
          onClose={() => setDetailsId(null)}
          onDelete={(task) => {
            setDetailsId(null);
            confirmDelete(taskRowFromTask(task));
          }}
          taskId={detailsId}
        />
      )}
    </>
  );

  return { actions, handlers, errors: <CommandErrors errors={actions.errors} t={t} />, overlays };
}
