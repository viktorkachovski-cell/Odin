import { useMemo } from 'react';

import {
  isRetryableWithSameRequestId,
  type CommandError,
  type MoveDirection,
  type TaskRowModel,
  type TaskState,
} from '@odin/contracts';

import type { OdinSupabaseClient } from './client.ts';
import { setTaskCompleted } from './commands.ts';
import { keysAffectedByTaskChange } from './query-keys.ts';
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
 * The commands every task row offers -- complete, set state, move -- wired
 * once with one invalidation set, so a screen renders rows instead of
 * re-declaring the same three commands. Pass the list id on list detail so its
 * own read is refreshed rather than every open list's.
 */
export function useTaskRowActions(client: OdinSupabaseClient, listId?: string): TaskRowActions {
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

  return {
    busy: complete.state.pending || state.state.pending || move.state.pending,
    errors: [rowCommandError(complete), rowCommandError(state), rowCommandError(move)],
    toggleCompleted: (task, completed) =>
      void complete.run({ taskId: task.id, expectedVersion: task.version, completed }),
    setState: (task, next) =>
      void state.run({ taskId: task.id, expectedVersion: task.version, state: next }),
    move: (task, direction) =>
      void move.run({ taskId: task.id, expectedVersion: task.version, direction }),
  };
}
