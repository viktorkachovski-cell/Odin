import type { TaskStatus } from '@odin/contracts';

export function taskStatus(task: {
  readonly completed: boolean;
  readonly blocked?: boolean;
  readonly assignee_id: string | null;
}): TaskStatus {
  if (task.completed) return 'done';
  if (task.blocked === true) return 'blocked';
  return task.assignee_id === null ? 'unassigned' : 'todo';
}

export interface TaskDeadlineFilter {
  readonly preset: 'all' | 'overdue' | 'today' | 'upcoming' | 'undated' | 'range';
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
