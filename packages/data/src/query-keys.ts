/**
 * Query keys shared by both clients so invalidation after a write or a realtime
 * hint targets exactly the same caches everywhere.
 */

export const queryKeys = {
  session: ['session'] as const,
  profile: ['profile'] as const,
  household: ['household'] as const,
  members: ['members'] as const,
  home: ['home'] as const,
  taskTemplates: ['task-templates'] as const,
  list: (listId: string) => ['list', listId] as const,
  myTasks: ['my-tasks'] as const,
  unassigned: ['unassigned'] as const,
} as const;

/**
 * A task write can move a task between Home counts, the open list, My Tasks and
 * Unassigned, so all four are invalidated together rather than guessing.
 */
export function keysAffectedByTaskChange(listId?: string): readonly (readonly string[])[] {
  return [
    queryKeys.home,
    queryKeys.myTasks,
    queryKeys.unassigned,
    ...(listId === undefined ? [] : [queryKeys.list(listId)]),
  ];
}

export function keysAffectedByTaskTemplateChange(): readonly (readonly string[])[] {
  return [queryKeys.taskTemplates];
}

export function keysAffectedByListChange(listId?: string): readonly (readonly string[])[] {
  return [queryKeys.home, ...(listId === undefined ? [] : [queryKeys.list(listId)])];
}

export function keysAffectedByMembershipChange(): readonly (readonly string[])[] {
  return [
    queryKeys.taskTemplates,
    queryKeys.profile,
    queryKeys.household,
    queryKeys.members,
    queryKeys.home,
    queryKeys.myTasks,
    queryKeys.unassigned,
  ];
}
