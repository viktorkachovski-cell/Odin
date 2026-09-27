import type { CommandResult, MoveDirection, TaskDto, TaskState } from '@odin/contracts';
import { parseListId, parseTask, parseTaskId } from '@odin/contracts';

import type { OdinSupabaseClient } from './client.ts';
import { command } from './commands.ts';

export function setTaskState(
  client: OdinSupabaseClient,
  requestId: string,
  input: {
    readonly taskId: string;
    readonly expectedVersion: number;
    readonly state: TaskState;
  },
): Promise<CommandResult<TaskDto>> {
  return command(
    client,
    'set_task_state',
    {
      request_id: requestId,
      task_id: input.taskId,
      expected_version: input.expectedVersion,
      state: input.state,
    },
    parseTask,
  );
}

export function moveTask(
  client: OdinSupabaseClient,
  requestId: string,
  input: {
    readonly taskId: string;
    readonly expectedVersion: number;
    readonly direction: MoveDirection;
  },
): Promise<CommandResult<string>> {
  return command(
    client,
    'move_task',
    {
      request_id: requestId,
      task_id: input.taskId,
      expected_version: input.expectedVersion,
      direction: input.direction,
    },
    parseTaskId,
  );
}

export function moveList(
  client: OdinSupabaseClient,
  requestId: string,
  input: {
    readonly listId: string;
    readonly expectedVersion: number;
    readonly direction: MoveDirection;
  },
): Promise<CommandResult<string>> {
  return command(
    client,
    'move_list',
    {
      request_id: requestId,
      list_id: input.listId,
      expected_version: input.expectedVersion,
      direction: input.direction,
    },
    parseListId,
  );
}
