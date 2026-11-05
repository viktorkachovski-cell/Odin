import type { TaskDto } from '@odin/contracts';
import { parseTask } from '@odin/contracts';

import type { OdinSupabaseClient } from './client.ts';
import { readRpc } from './repositories.ts';

/**
 * One full task, assignment set included. Missing, archived and inaccessible
 * tasks are the same `NOT_FOUND`; the server checks the open parent and the
 * caller's household.
 */
export function getTask(client: OdinSupabaseClient, taskId: string): Promise<TaskDto> {
  return readRpc(client, 'get_task_v2', (data) => parseTask(data), { p_task_id: taskId });
}
