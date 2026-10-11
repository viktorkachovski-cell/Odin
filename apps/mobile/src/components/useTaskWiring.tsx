import { useState, type ReactNode } from 'react';
import { Alert } from 'react-native';

import { taskRowFromTask, type MemberDto, type TaskRowModel } from '@odin/contracts';
import { useTaskRowActions, type TaskRowActions } from '@odin/data';

import { useOdin } from '../state/OdinContext.ts';
import { useEvent } from '../state/useEvent.ts';
import { CommandErrors } from './ListDetailSections.tsx';
import { TaskDetailsFlow } from './TaskDetailsFlow.tsx';

/**
 * Every screen with task rows wires them the same way: the shared row
 * commands, the task editor, and a confirmation before Unassign or Delete.
 * Handlers keep one identity for the screen's life, so memoized rows only
 * render again when their own task changes.
 */

export interface TaskRowHandlers {
  readonly onToggleCompleted: TaskRowActions['toggleCompleted'];
  readonly onSetState: TaskRowActions['setState'];
  readonly onClaim: TaskRowActions['claim'];
  readonly onPress: (task: TaskRowModel) => void;
  readonly onUnassign: (task: TaskRowModel) => void;
  readonly onDelete: (task: TaskRowModel) => void;
}

export function useTaskWiring({
  members,
  listId,
  editable = true,
}: {
  readonly members: readonly MemberDto[];
  readonly listId?: string | undefined;
  readonly editable?: boolean;
}): {
  readonly actions: TaskRowActions;
  readonly handlers: TaskRowHandlers;
  readonly errors: ReactNode;
  readonly overlays: ReactNode;
} {
  const { t, client } = useOdin();
  const actions = useTaskRowActions(client, listId);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  const confirmDelete = useEvent((task: TaskRowModel) =>
    Alert.alert(t('task.delete.title'), t('task.delete.confirm'), [
      { text: t('action.cancel'), style: 'cancel' },
      {
        text: t('task.delete.short'),
        style: 'destructive',
        onPress: () => actions.remove(task),
      },
    ]),
  );
  const confirmUnassign = useEvent((task: TaskRowModel) =>
    Alert.alert(t('task.unassign.title'), t('task.unassign.confirm'), [
      { text: t('action.cancel'), style: 'cancel' },
      { text: t('task.unassign.short'), onPress: () => actions.unassign(task) },
    ]),
  );
  const handlers: TaskRowHandlers = {
    onToggleCompleted: useEvent(actions.toggleCompleted),
    onSetState: useEvent(actions.setState),
    onClaim: useEvent(actions.claim),
    onPress: useEvent((task: TaskRowModel) => setDetailsId(task.id)),
    onUnassign: confirmUnassign,
    onDelete: confirmDelete,
  };

  const overlays = (
    <TaskDetailsFlow
      editable={editable}
      key={detailsId ?? 'closed'}
      members={members}
      onClose={() => setDetailsId(null)}
      onDelete={(task) => {
        setDetailsId(null);
        confirmDelete(taskRowFromTask(task));
      }}
      taskId={detailsId}
    />
  );

  return { actions, handlers, errors: <CommandErrors errors={actions.errors} t={t} />, overlays };
}
