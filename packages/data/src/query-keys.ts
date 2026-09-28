/**
 * Query keys shared by both clients so invalidation after a write or a realtime
 * hint targets exactly the same caches everywhere.
 */

import type { ChangeKind } from './realtime.ts';

export const queryKeys = {
  session: ['session'] as const,
  profile: ['profile'] as const,
  household: ['household'] as const,
  members: ['members'] as const,
  home: ['home'] as const,
  taskTemplates: ['task-templates'] as const,
  list: (listId: string) => ['list', listId] as const,
  task: (taskId: string) => ['task', taskId] as const,
  allTasks: ['all-tasks'] as const,
  myTasks: ['my-tasks'] as const,
  unassigned: ['unassigned'] as const,
} as const;

/**
 * A task write can move a task between Home counts, the open list, My Tasks and
 * Unassigned, so all four are invalidated together rather than guessing.
 */
export function keysAffectedByTaskChange(listId?: string): readonly (readonly string[])[] {
  return [
    ['task'],
    queryKeys.allTasks,
    queryKeys.home,
    queryKeys.myTasks,
    queryKeys.unassigned,
    listId === undefined ? ['list'] : queryKeys.list(listId),
  ];
}

export function keysAffectedByTaskTemplateChange(): readonly (readonly string[])[] {
  return [queryKeys.taskTemplates];
}

export function keysAffectedByListChange(listId?: string): readonly (readonly string[])[] {
  return [
    queryKeys.allTasks,
    ['task'],
    queryKeys.home,
    queryKeys.myTasks,
    queryKeys.unassigned,
    listId === undefined ? ['list'] : queryKeys.list(listId),
  ];
}

/**
 * The keys a batch of realtime hints invalidates, each once. Invalidating the
 * same key twice restarts a refetch that is already running.
 */
export function keysAffectedByChanges(kinds: Iterable<ChangeKind>): readonly (readonly string[])[] {
  const byId = new Map<string, readonly string[]>();
  for (const kind of kinds) {
    const keys =
      kind === 'task'
        ? keysAffectedByTaskChange()
        : kind === 'list'
          ? keysAffectedByListChange()
          : keysAffectedByMembershipChange();
    for (const key of keys) byId.set(key.join('\u0000'), key);
  }
  return [...byId.values()];
}

export function keysAffectedByMembershipChange(): readonly (readonly string[])[] {
  return [
    ['list'],
    queryKeys.allTasks,
    ['task'],
    queryKeys.taskTemplates,
    queryKeys.profile,
    queryKeys.household,
    queryKeys.members,
    queryKeys.home,
    queryKeys.myTasks,
    queryKeys.unassigned,
  ];
}
