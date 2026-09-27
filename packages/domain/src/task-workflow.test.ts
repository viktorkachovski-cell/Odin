import { describe, expect, it } from 'vitest';

import { resolveTaskDeadlineFilter, taskStatus } from './task-workflow.ts';

describe('automatic task status', () => {
  it('follows assignment until explicitly blocked or completed', () => {
    expect(taskStatus({ completed: false, assignee_id: null })).toBe('unassigned');
    expect(taskStatus({ completed: false, assignee_id: 'member' })).toBe('todo');
    expect(taskStatus({ completed: false, assignee_id: null, blocked: true })).toBe('blocked');
    expect(taskStatus({ completed: false, assignee_id: 'member', blocked: true })).toBe('blocked');
    expect(taskStatus({ completed: true, assignee_id: null, blocked: true })).toBe('done');
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
