import {
  keysAffectedByTaskChange,
  setTaskCompleted,
  updateTask,
  useCommand,
  type OdinSupabaseClient,
} from '@odin/data';

/** Commands used by task rows; the editor owns its separate save lifecycle. */
export function useTaskRowCommands(client: OdinSupabaseClient, listId: string | undefined) {
  const invalidate = keysAffectedByTaskChange(listId);
  const completeCommand = useCommand(
    (
      requestId,
      input: {
        readonly taskId: string;
        readonly expectedVersion: number;
        readonly completed: boolean;
      },
    ) => setTaskCompleted(client, requestId, input),
    { invalidate },
  );
  const unassignTask = useCommand(
    (
      requestId,
      input: {
        readonly taskId: string;
        readonly expectedVersion: number;
        readonly title: string;
        readonly dueAt: string | null;
      },
    ) =>
      updateTask(client, requestId, {
        taskId: input.taskId,
        expectedVersion: input.expectedVersion,
        title: input.title,
        assigneeId: null,
        dueAt: input.dueAt,
      }),
    { invalidate },
  );
  return { completeCommand, unassignTask };
}
