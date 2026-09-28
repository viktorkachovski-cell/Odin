import { describe, expect, it } from 'vitest';

import {
  taskDraft,
  adjacentMoves,
  resolveTaskDeadlineFilter,
  taskState,
  taskStatus,
  taskStatusOptions,
} from './task-workflow.ts';
import { dueIssueKey } from './dates.ts';

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

describe('task editor drafts', () => {
  it('starts a new task empty and an existing one from its fields', () => {
    expect(taskDraft(null)).toEqual({
      title: '',
      notes: '',
      assigneeId: null,
      dueDate: '',
      dueTime: '',
    });
    const draft = taskDraft({
      id: 't1',
      household_id: 'h1',
      list_id: 'l1',
      title: 'Pantry',
      notes: null,
      sort_order: 1,
      completed: false,
      assignee_id: 'u1',
      due_at: null,
      created_at: '2030-01-01T00:00:00Z',
      updated_at: '2030-01-01T00:00:00Z',
      version: 1,
    });
    expect(draft).toMatchObject({ title: 'Pantry', notes: '', assigneeId: 'u1', dueDate: '' });
  });

  it('names the message for each deadline problem', () => {
    expect(dueIssueKey('invalid_format')).toBe('validation.due.invalid_format');
    expect(dueIssueKey('nonexistent_local_time')).toBe('validation.due.nonexistent_local_time');
  });
});
