import type { TaskDto } from '@odin/contracts';
import { parseTask } from '@odin/contracts';

import type { OdinSupabaseClient } from './client.ts';
import { mapPostgrestError, OdinError, toOdinError } from './error-mapping.ts';

/** RLS protects both rows; the inner join also excludes archived parents. */
export async function getTask(client: OdinSupabaseClient, taskId: string): Promise<TaskDto> {
  try {
    const { data, error } = await client
      .from('tasks')
      .select('*, lists!inner(status)')
      .eq('id', taskId)
      .eq('lists.status', 'open')
      .maybeSingle();
    if (error !== null) throw new OdinError(mapPostgrestError(error));
    if (data === null) throw new OdinError({ code: 'NOT_FOUND', message_key: 'error.not_found' });
    return parseTask(data);
  } catch (cause) {
    throw toOdinError(cause);
  }
}
