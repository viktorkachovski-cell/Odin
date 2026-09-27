import type { AllTaskPageDto, CommandResult, TaskDto, TaskStatus } from '@odin/contracts';
import { parseAllTaskPage, parseListId, parseTask, parseTaskId } from '@odin/contracts';
import { resolveTaskDeadlineFilter, type TaskDeadlineFilter } from '@odin/domain';

import type { OdinSupabaseClient } from './client.ts';
import { command } from './commands.ts';
import { OdinError } from './error-mapping.ts';
import { readRpc } from './repositories.ts';

export interface TaskStatusInput {
  readonly taskId: string;
  readonly expectedVersion: number;
  readonly status: TaskStatus;
}

export function setTaskStatus(
  client: OdinSupabaseClient,
  requestId: string,
  input: TaskStatusInput,
): Promise<CommandResult<TaskDto>> {
  return command(
    client,
    'set_task_status',
    {
      request_id: requestId,
      task_id: input.taskId,
      expected_version: input.expectedVersion,
      status: input.status,
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
    readonly direction: 'up' | 'down';
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
    readonly direction: 'up' | 'down';
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

export function getAllTasks(
  client: OdinSupabaseClient,
  filter: TaskDeadlineFilter,
  cursor?: string | null,
  now = new Date(),
): Promise<AllTaskPageDto> {
  const result = resolveTaskDeadlineFilter(filter, now);
  if (!result.ok) throw new OdinError({ code: 'VALIDATION', message_key: 'filter.date.invalid' });
  return readRpc(client, 'get_all_tasks', parseAllTaskPage, {
    p_due_from: result.bounds.dueFrom,
    p_due_before: result.bounds.dueBefore,
    p_undated: result.bounds.undated,
    p_incomplete_only: result.bounds.incompleteOnly,
    p_cursor: cursor ?? null,
  });
}
