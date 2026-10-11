/**
 * The cross-list task views both clients render from one household read:
 * the Today summary and the Tasks register (Mine / Unassigned / Everyone,
 * deadline chips, search, done toggle). Keeping the filtering and grouping here
 * means Android and web can never disagree about which task is "overdue" or
 * which group it sits in.
 */

import { isOverdue } from './dates.ts';
import { sortTasksByDue, type DueOrdered } from './sorting.ts';
import { resolveTaskDeadlineFilter, type TaskDeadlineFilter } from './task-workflow.ts';

export const TASK_VIEWS = ['mine', 'unassigned', 'everyone'] as const;
export type TaskView = (typeof TASK_VIEWS)[number];

export function isTaskView(value: string | null | undefined): value is TaskView {
  return value !== null && value !== undefined && TASK_VIEWS.some((view) => view === value);
}

/** Display groups, in the order they render. */
export const DEADLINE_GROUPS = ['overdue', 'today', 'upcoming', 'undated', 'done'] as const;
export type DeadlineGroup = (typeof DEADLINE_GROUPS)[number];

export interface ViewTask extends DueOrdered {
  readonly title: string;
  readonly notes?: string | null | undefined;
  readonly completed: boolean;
  readonly blocked?: boolean | undefined;
  readonly assignee_id: string | null;
  readonly list_title?: string | undefined;
}

function startOfDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function startOfTomorrow(now: Date): Date {
  const result = startOfDay(now);
  result.setDate(result.getDate() + 1);
  return result;
}

/**
 * Exactly one group per task. Completed tasks are always `done`; an open task
 * past its deadline is `overdue` even when the deadline was earlier today, so
 * `today` holds only what is still ahead of the member today.
 */
export function deadlineGroup(task: ViewTask, now: Date = new Date()): DeadlineGroup {
  if (task.completed) return 'done';
  if (task.due_at === null) return 'undated';
  if (isOverdue(task, now)) return 'overdue';
  const due = Date.parse(task.due_at);
  if (Number.isNaN(due)) return 'undated';
  return due < startOfTomorrow(now).getTime() ? 'today' : 'upcoming';
}

export interface TaskGroup<T> {
  readonly group: DeadlineGroup;
  readonly tasks: readonly T[];
}

/** Non-empty groups in display order, each sorted by due date (undated last). */
export function groupTasksByDeadline<T extends ViewTask>(
  tasks: readonly T[],
  now: Date = new Date(),
): readonly TaskGroup<T>[] {
  const buckets = new Map<DeadlineGroup, T[]>();
  for (const task of sortTasksByDue(tasks)) {
    const group = deadlineGroup(task, now);
    const bucket = buckets.get(group) ?? [];
    bucket.push(task);
    buckets.set(group, bucket);
  }
  return DEADLINE_GROUPS.flatMap((group) => {
    const bucket = buckets.get(group);
    return bucket === undefined ? [] : [{ group, tasks: bucket }];
  });
}

export interface TaskViewFilter {
  readonly view: TaskView;
  readonly userId: string | null;
  readonly deadline: TaskDeadlineFilter;
  readonly search?: string;
  /** Only meaningful for Everyone: Mine and Unassigned never include done tasks. */
  readonly showDone?: boolean;
  readonly blockedOnly?: boolean;
}

function matchesView(task: ViewTask, view: TaskView, userId: string | null): boolean {
  if (view === 'mine') return !task.completed && userId !== null && task.assignee_id === userId;
  if (view === 'unassigned') return !task.completed && task.assignee_id === null;
  return true;
}

function matchesSearch(task: ViewTask, needle: string): boolean {
  if (needle.length === 0) return true;
  const haystack =
    `${task.title}\n${task.notes ?? ''}\n${task.list_title ?? ''}`.toLocaleLowerCase();
  return haystack.includes(needle);
}

/**
 * Applies the deadline preset with exactly the bounds the server filter uses,
 * so moving the filter client-side changes no result.
 */
function matchesDeadline(task: ViewTask, filter: TaskDeadlineFilter, now: Date): boolean {
  const resolution = resolveTaskDeadlineFilter(filter, now);
  if (!resolution.ok) return false;
  const { bounds } = resolution;
  if (bounds.incompleteOnly && task.completed) return false;
  if (bounds.undated) return task.due_at === null;
  if (bounds.dueFrom === null && bounds.dueBefore === null) return true;
  if (task.due_at === null) return false;
  const due = Date.parse(task.due_at);
  if (bounds.dueFrom !== null && due < Date.parse(bounds.dueFrom)) return false;
  if (bounds.dueBefore !== null && due >= Date.parse(bounds.dueBefore)) return false;
  return true;
}

export function filterTasks<T extends ViewTask>(
  tasks: readonly T[],
  filter: TaskViewFilter,
  now: Date = new Date(),
): T[] {
  const needle = (filter.search ?? '').trim().toLocaleLowerCase();
  const includeDone = filter.view === 'everyone' && filter.showDone === true;
  return tasks.filter(
    (task) =>
      matchesView(task, filter.view, filter.userId) &&
      (includeDone || !task.completed) &&
      (filter.blockedOnly !== true || (task.blocked === true && !task.completed)) &&
      matchesDeadline(task, filter.deadline, now) &&
      matchesSearch(task, needle),
  );
}

export interface TaskSummary {
  /** Open tasks past their deadline, anyone's. */
  readonly overdue: number;
  /** Open tasks still due later today, anyone's. */
  readonly dueToday: number;
  readonly unassigned: number;
  readonly blocked: number;
  /** Open tasks assigned to the member. */
  readonly mine: number;
}

export function summarizeTasks(
  tasks: readonly ViewTask[],
  userId: string | null,
  now: Date = new Date(),
): TaskSummary {
  let overdue = 0;
  let dueToday = 0;
  let unassigned = 0;
  let blocked = 0;
  let mine = 0;
  for (const task of tasks) {
    if (task.completed) continue;
    const group = deadlineGroup(task, now);
    if (group === 'overdue') overdue += 1;
    if (group === 'today') dueToday += 1;
    if (task.assignee_id === null) unassigned += 1;
    if (task.blocked === true) blocked += 1;
    if (userId !== null && task.assignee_id === userId) mine += 1;
  }
  return { overdue, dueToday, unassigned, blocked, mine };
}
