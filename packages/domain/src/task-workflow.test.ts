import { describe, expect, it } from 'vitest';

import {
  adjacentMoves,
  resolveTaskDeadlineFilter,
  taskState,
  taskStatus,
  taskStatusOptions,
} from './task-workflow.ts';

describe('automatic task status', () => {
  it('follows assignment until explicitly blocked or completed', () => {
    expect(taskStatus({ completed: false, assignee_id: null })).toBe('unassigned');
    expect(taskStatus({ completed: false, assignee_id: 'member' })).toBe('todo');
    expect(taskStatus({ completed: false, assignee_id: null, blocked: true })).toBe('blocked');
    expect(taskStatus({ completed: false, assignee_id: 'member', blocked: true })).toBe('blocked');
    expect(taskStatus({ completed: true, assignee_id: null, blocked: true })).toBe('done');
  });

  it('stores only open, blocked or done', () => {
    expect(taskState({ completed: false, assignee_id: 'member' })).toBe('open');
    expect(taskState({ completed: false, assignee_id: null, blocked: true })).toBe('blocked');
    expect(taskState({ completed: true, assignee_id: null })).toBe('done');
  });

  it('labels the open option from the assignee, whatever the current state', () => {
    expect(taskStatusOptions({ completed: false, assignee_id: null })).toEqual([
      { state: 'open', status: 'unassigned' },
      { state: 'blocked', status: 'blocked' },
      { state: 'done', status: 'done' },
    ]);
    expect(
      taskStatusOptions({ completed: true, assignee_id: 'member', blocked: false })[0],
    ).toEqual({ state: 'open', status: 'todo' });
  });
});

describe('adjacent moves', () => {
  const rows = [
    { id: 'a', completed: false },
    { id: 'b', completed: false },
    { id: 'c', completed: true },
  ];
  const byCompletion = (row: { readonly completed: boolean }) => row.completed;

  it('stops at the ends and at a group boundary', () => {
    expect(adjacentMoves(rows, 0, byCompletion)).toEqual({ up: false, down: true });
    expect(adjacentMoves(rows, 1, byCompletion)).toEqual({ up: true, down: false });
    expect(adjacentMoves(rows, 2, byCompletion)).toEqual({ up: false, down: false });
  });

  it('treats an index outside the rows as immovable', () => {
    expect(adjacentMoves(rows, 5, byCompletion)).toEqual({ up: false, down: false });
  });
});

describe('deadline filter boundaries', () => {
  const now = new Date(2026, 8, 27, 12, 30);

  it('uses local midnight and an exclusive next midnight for Today', () => {
    expect(resolveTaskDeadlineFilter({ preset: 'today' }, now)).toEqual({
      ok: true,
      bounds: {
        dueFrom: new Date(2026, 8, 27).toISOString(),
        dueBefore: new Date(2026, 8, 28).toISOString(),
        undated: false,
        incompleteOnly: false,
      },
    });
  });

  it('overdue excludes completed and uses the current instant; upcoming begins tomorrow', () => {
    expect(resolveTaskDeadlineFilter({ preset: 'overdue' }, now)).toMatchObject({
      ok: true,
      bounds: { dueBefore: now.toISOString(), incompleteOnly: true },
    });
    expect(resolveTaskDeadlineFilter({ preset: 'upcoming' }, now)).toMatchObject({
      ok: true,
      bounds: { dueFrom: new Date(2026, 8, 28).toISOString() },
    });
  });

  it('includes the entire last date in a range, including the DST transition day', () => {
    expect(
      resolveTaskDeadlineFilter({ preset: 'range', from: '2026-10-25', to: '2026-10-25' }),
    ).toMatchObject({
      ok: true,
      bounds: {
        dueFrom: new Date(2026, 9, 25).toISOString(),
        dueBefore: new Date(2026, 9, 26).toISOString(),
      },
    });
  });

  it.each([
    ['2026-02-30', '2026-03-01'],
    ['', '2026-03-01'],
    ['2026-03-01', '2026-02-28'],
    ['2026-13-01', '2026-13-02'],
  ])('rejects invalid or reversed dates %s through %s', (from, to) => {
    expect(resolveTaskDeadlineFilter({ preset: 'range', from, to }).ok).toBe(false);
  });

  it('keeps no-deadline and all-deadlines queries distinct', () => {
    expect(resolveTaskDeadlineFilter({ preset: 'undated' })).toMatchObject({
      ok: true,
      bounds: { undated: true },
    });
    expect(resolveTaskDeadlineFilter({ preset: 'all' })).toMatchObject({
      ok: true,
      bounds: { undated: false, dueFrom: null, dueBefore: null },
    });
  });
});
