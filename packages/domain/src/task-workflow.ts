import { TASK_STATES, type TaskState } from '@odin/contracts';

/**
 * What a member sees. The stored state is open, blocked or done; an open task
 * reads as Unassigned or To-do depending on whether anyone is assigned.
 */
export const TASK_STATUSES = ['unassigned', 'todo', 'blocked', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

interface StatusSubject {
  readonly completed: boolean;
  readonly blocked?: boolean;
  readonly assignee_id: string | null;
}

export function taskState(task: StatusSubject): TaskState {
  if (task.completed) return 'done';
  return task.blocked === true ? 'blocked' : 'open';
}

export function taskStatus(task: StatusSubject): TaskStatus {
  const state = taskState(task);
  if (state !== 'open') return state;
  return task.assignee_id === null ? 'unassigned' : 'todo';
}

export interface TaskStatusOption {
  readonly state: TaskState;
  readonly status: TaskStatus;
}

/** Every state a member can choose for this task, labelled with the status it would show. */
export function taskStatusOptions(task: StatusSubject): readonly TaskStatusOption[] {
  return TASK_STATES.map((state) => ({
    state,
    status: taskStatus({ ...task, completed: state === 'done', blocked: state === 'blocked' }),
  }));
}

/**
 * Whether the row at `index` can move one place up or down. Rows move only
 * within their group -- tasks within their completion group, lists within
 * their kind -- so a neighbour from another group is a boundary.
 */
export function adjacentMoves<T>(
  rows: readonly T[],
  index: number,
  group: (row: T) => unknown,
): { readonly up: boolean; readonly down: boolean } {
  const row = rows[index];
  if (row === undefined) return { up: false, down: false };
  const sameGroup = (neighbour: T | undefined): boolean =>
    neighbour !== undefined && group(neighbour) === group(row);
  return { up: sameGroup(rows[index - 1]), down: sameGroup(rows[index + 1]) };
}

export const TASK_DEADLINE_PRESETS = [
  'all',
  'overdue',
  'today',
  'upcoming',
  'undated',
  'range',
] as const;
export type TaskDeadlinePreset = (typeof TASK_DEADLINE_PRESETS)[number];

export interface TaskDeadlineFilter {
  readonly preset: TaskDeadlinePreset;
  readonly from?: string;
  readonly to?: string;
}

export interface TaskDeadlineBounds {
  readonly dueFrom: string | null;
  readonly dueBefore: string | null;
  readonly undated: boolean;
  readonly incompleteOnly: boolean;
}

export type TaskDeadlineResolution =
  | { readonly ok: true; readonly bounds: TaskDeadlineBounds }
  | { readonly ok: false; readonly reason: 'invalid_date' | 'invalid_range' };

function dateStart(input: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const [year = 0, month = 0, day = 0] = input.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

function nextDay(date: Date): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + 1);
  return result;
}

/** Local calendar boundaries, with an exclusive next-day upper bound across DST changes. */
export function resolveTaskDeadlineFilter(
  filter: TaskDeadlineFilter,
  now = new Date(),
): TaskDeadlineResolution {
  const bounds: TaskDeadlineBounds = {
    dueFrom: null,
    dueBefore: null,
    undated: false,
    incompleteOnly: false,
  };
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (filter.preset) {
    case 'all':
      return { ok: true, bounds };
    case 'undated':
      return { ok: true, bounds: { ...bounds, undated: true } };
    case 'overdue':
      return {
        ok: true,
        bounds: { ...bounds, dueBefore: now.toISOString(), incompleteOnly: true },
      };
    case 'today':
      return {
        ok: true,
        bounds: {
          ...bounds,
          dueFrom: today.toISOString(),
          dueBefore: nextDay(today).toISOString(),
        },
      };
    case 'upcoming':
      return { ok: true, bounds: { ...bounds, dueFrom: nextDay(today).toISOString() } };
    case 'range': {
      const from = dateStart(filter.from ?? '');
      const to = dateStart(filter.to ?? '');
      if (from === null || to === null) return { ok: false, reason: 'invalid_date' };
      if (from > to) return { ok: false, reason: 'invalid_range' };
      return {
        ok: true,
        bounds: { ...bounds, dueFrom: from.toISOString(), dueBefore: nextDay(to).toISOString() },
      };
    }
  }
}
