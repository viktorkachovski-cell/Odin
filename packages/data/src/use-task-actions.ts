import { useMemo } from 'react';

import {
  isRetryableWithSameRequestId,
  type CommandError,
  type MoveDirection,
  type TaskRowModel,
  type TaskState,
} from '@odin/contracts';

import type { OdinSupabaseClient } from './client.ts';
import { deleteTask, setTaskCompleted } from './commands.ts';
import { keysAffectedByTaskChange } from './query-keys.ts';
import { addTaskAssignee, removeTaskAssignee, setTaskAssignees } from './task-assignment.ts';
import { moveTask, setTaskState } from './task-workflow.ts';
import { useCommand, type UseCommandResult } from './use-command.ts';

export interface TaskRowCommandError {
  readonly error: CommandError | null;
  /** Present only when re-sending under the same request ID is safe (NETWORK). */
  readonly retry?: () => void;
}

export interface TaskRowActions {
  /** True while any row command is in flight or its reads are refetching. */
  readonly busy: boolean;
  readonly errors: readonly TaskRowCommandError[];
  readonly toggleCompleted: (task: TaskRowModel, completed: boolean) => void;
  readonly setState: (task: TaskRowModel, state: TaskState) => void;
  readonly move: (task: TaskRowModel, direction: MoveDirection) => void;
  /** Adds the signed-in member to the task, keeping everyone already on it. */
  readonly assignMe: (task: TaskRowModel) => void;
  /** Removes only the signed-in member. */
  readonly removeMe: (task: TaskRowModel) => void;
  /** Clears every assignee under the row's version; title, notes and deadline are untouched. */
  readonly clearAssignees: (task: TaskRowModel) => void;
  /** Permanent. Callers confirm with the member before calling it. */
  readonly remove: (task: TaskRowModel) => void;
}

interface VersionedTask {
  readonly taskId: string;
  readonly expectedVersion: number;
}

function rowCommandError<TInput, TData>(
  command: UseCommandResult<TInput, TData>,
): TaskRowCommandError {
  const { error } = command.state;
  return error !== null && isRetryableWithSameRequestId(error)
    ? { error, retry: () => void command.retry() }
    : { error };
}

/**
 * The commands every task row offers, wired once with one invalidation set.
 * Pass the list id on list detail so its own read is refreshed rather than
 * every open list's.
 */
export function useTaskRowActions(
  client: OdinSupabaseClient,
  options: {
    /** The member the row actions act for. */
    readonly userId: string | null;
    readonly listId?: string | undefined;
  },
): TaskRowActions {
  const { userId, listId } = options;
  const invalidate = useMemo(() => keysAffectedByTaskChange(listId), [listId]);
  const complete = useCommand(
    (requestId, input: VersionedTask & { readonly completed: boolean }) =>
      setTaskCompleted(client, requestId, input),
    { invalidate },
  );
  const state = useCommand(
    (requestId, input: VersionedTask & { readonly state: TaskState }) =>
      setTaskState(client, requestId, input),
    { invalidate },
  );
  const move = useCommand(
    (requestId, input: VersionedTask & { readonly direction: MoveDirection }) =>
      moveTask(client, requestId, input),
    { invalidate },
  );

  const assign = useCommand(
    (requestId, input: { readonly taskId: string; readonly userId: string }) =>
      addTaskAssignee(client, requestId, input),
    { invalidate },
  );
  const leave = useCommand(
    (requestId, input: { readonly taskId: string; readonly userId: string }) =>
      removeTaskAssignee(client, requestId, input),
    { invalidate },
  );
  const clear = useCommand(
    (requestId, input: VersionedTask) =>
      setTaskAssignees(client, requestId, { ...input, assigneeIds: [] }),
    { invalidate },
  );
  const remove = useCommand(
    (requestId, input: VersionedTask) => deleteTask(client, requestId, input),
    { invalidate },
  );
  const pending = [complete, state, move, assign, leave, clear, remove].map(
    (entry) => entry.state.pending,
  );

  return {
    busy: pending.some(Boolean),
    errors: [
      rowCommandError(complete),
      rowCommandError(state),
      rowCommandError(move),
      rowCommandError(assign),
      rowCommandError(leave),
      rowCommandError(clear),
      rowCommandError(remove),
    ],
    toggleCompleted: (task, completed) =>
      void complete.run({ taskId: task.id, expectedVersion: task.version, completed }),
    setState: (task, next) =>
      void state.run({ taskId: task.id, expectedVersion: task.version, state: next }),
    move: (task, direction) =>
      void move.run({ taskId: task.id, expectedVersion: task.version, direction }),
    assignMe: (task) => {
      if (userId !== null) void assign.run({ taskId: task.id, userId });
    },
    removeMe: (task) => {
      if (userId !== null) void leave.run({ taskId: task.id, userId });
    },
    clearAssignees: (task) => void clear.run({ taskId: task.id, expectedVersion: task.version }),
    remove: (task) => void remove.run({ taskId: task.id, expectedVersion: task.version }),
  };
}
