import type { CommandResult, TaskDto } from '@odin/contracts';
import { parseTask } from '@odin/contracts';
import { canonicalAssigneeIds } from '@odin/domain';

import type { OdinSupabaseClient } from './client.ts';
import { command } from './commands.ts';

/*
 * Assignment commands. Replacing the whole set and changing one member are
 * different operations on purpose:
 *
 *  - `setTaskAssignees` (and the editor's `updateTask`) replace the complete
 *    set under the version they were based on, so a stale view can never
 *    overwrite a change it did not see.
 *  - `addTaskAssignee` and `removeTaskAssignee` change one member and nothing
 *    else, on whatever the set is now. They carry no version because they
 *    commute: two members adding different people both succeed. Repeating one
 *    is a successful no-op.
 *
 * Every one returns the full task, including its new version and assignees.
 */

/** Replaces only the assignment set; an empty set clears everyone. */
export function setTaskAssignees(
  client: OdinSupabaseClient,
  requestId: string,
  input: {
    readonly taskId: string;
    readonly expectedVersion: number;
    readonly assigneeIds: readonly string[];
  },
): Promise<CommandResult<TaskDto>> {
  return command(
    client,
    'set_task_assignees',
    {
      request_id: requestId,
      task_id: input.taskId,
      expected_version: input.expectedVersion,
      assignee_ids: canonicalAssigneeIds(input.assigneeIds),
    },
    (data) => parseTask(data),
  );
}

/** Adds one member, keeping everyone already assigned. */
export function addTaskAssignee(
  client: OdinSupabaseClient,
  requestId: string,
  input: { readonly taskId: string; readonly userId: string },
): Promise<CommandResult<TaskDto>> {
  return command(
    client,
    'add_task_assignee',
    { request_id: requestId, task_id: input.taskId, user_id: input.userId },
    (data) => parseTask(data),
  );
}

/** Removes one member, keeping everyone else. */
export function removeTaskAssignee(
  client: OdinSupabaseClient,
  requestId: string,
  input: { readonly taskId: string; readonly userId: string },
): Promise<CommandResult<TaskDto>> {
  return command(
    client,
    'remove_task_assignee',
    { request_id: requestId, task_id: input.taskId, user_id: input.userId },
    (data) => parseTask(data),
  );
}
