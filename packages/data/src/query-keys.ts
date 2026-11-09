/**
 * Query keys shared by both clients so invalidation after a write or a realtime
 * hint targets exactly the same caches everywhere.
 */

import type { ChangeKind } from './realtime.ts';

export const queryKeys = {
  profile: ['profile'] as const,
  household: ['household'] as const,
  members: ['members'] as const,
  home: ['home'] as const,
  projects: ['projects'] as const,
  taskTemplates: ['task-templates'] as const,
  list: (listId: string) => ['list', listId] as const,
  task: (taskId: string) => ['task', taskId] as const,
  allTasks: ['all-tasks'] as const,
  myTasks: ['my-tasks'] as const,
  unassigned: ['unassigned'] as const,
} as const;

/**
 * A task or list write can move a task between list counts, the open list and
 * every cross-list read, so they are invalidated together rather than guessed.
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

/** A list write also moves a project's list count. */
export function keysAffectedByListChange(listId?: string): readonly (readonly string[])[] {
  return [...keysAffectedByTaskChange(listId), queryKeys.projects];
}

/**
 * A project write regroups lists on the household summary and changes what
 * every open list says about its project.
 */
export function keysAffectedByProjectChange(): readonly (readonly string[])[] {
  return [queryKeys.projects, queryKeys.home, ['list']];
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
          : kind === 'project'
            ? keysAffectedByProjectChange()
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
    queryKeys.projects,
    queryKeys.myTasks,
    queryKeys.unassigned,
  ];
}
