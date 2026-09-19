/**
 * Deterministic orderings. These mirror the SQL ORDER BY clauses exactly so a
 * client-side re-sort after an optimistic update never disagrees with the next
 * server page.
 */

import type { TaskDto } from '@odin/contracts';

/**
 * The minimum a row needs to take part in the due ordering. Both the full task
 * and the cross-list projection satisfy it once normalised.
 */
export interface DueOrdered {
  readonly id: string;
  readonly list_id: string;
  readonly due_at: string | null;
}

/** Undated tasks sort last; the server uses coalesce(due_at, 'infinity') for the same effect. */
const NEVER_DUE = Number.POSITIVE_INFINITY;

function dueKey(due_at: string | null): number {
  if (due_at === null) return NEVER_DUE;
  const parsed = Date.parse(due_at);
  return Number.isNaN(parsed) ? NEVER_DUE : parsed;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** List detail: incomplete first, then declared order, then id as a stable tie-breaker. */
export function compareTasksInList(a: TaskDto, b: TaskDto): number {
  if (a.completed !== b.completed) return a.completed ? 1 : -1;
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return compareText(a.id, b.id);
}

/** My Tasks and Unassigned: due ascending with undated last, then list id, then task id. */
export function compareTasksByDue(a: DueOrdered, b: DueOrdered): number {
  const left = dueKey(a.due_at);
  const right = dueKey(b.due_at);
  if (left !== right) return left - right;
  const byList = compareText(a.list_id, b.list_id);
  if (byList !== 0) return byList;
  return compareText(a.id, b.id);
}

export function sortTasksInList(tasks: readonly TaskDto[]): TaskDto[] {
  return [...tasks].sort(compareTasksInList);
}

export function sortTasksByDue<T extends DueOrdered>(tasks: readonly T[]): T[] {
  return [...tasks].sort(compareTasksByDue);
}
