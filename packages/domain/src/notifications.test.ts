import { describe, expect, it } from 'vitest';

import {
  diffAssignedTasks,
  DUE_REMINDER_LEAD_MS,
  dueReminderKey,
  planDueReminders,
  type DueReminderCandidate,
} from './notifications.ts';

const NOW = Date.parse('2026-09-22T09:00:00.000Z');

function task(overrides: Partial<DueReminderCandidate> = {}): DueReminderCandidate {
  return {
    id: 'task-1',
    title: 'Water the plants',
    listTitle: 'Weekly',
    dueAt: new Date(NOW + 3 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

describe('planDueReminders', () => {
  it('plans all three stages at the owner-selected offsets', () => {
    const due = NOW + 3 * 24 * 60 * 60 * 1000;
    const planned = planDueReminders([task()], NOW);

    expect(planned.map((plan) => plan.stage)).toEqual(['day', 'hours', 'imminent']);
    expect(planned.map((plan) => plan.fireAtMs)).toEqual([
      due - DUE_REMINDER_LEAD_MS.day,
      due - DUE_REMINDER_LEAD_MS.hours,
      due - DUE_REMINDER_LEAD_MS.imminent,
    ]);
  });

  it('skips a stage whose moment has already passed', () => {
    // Two hours out: the 24-hour and 4-hour warnings are both history.
    const planned = planDueReminders(
      [task({ dueAt: new Date(NOW + 2 * 60 * 60 * 1000).toISOString() })],
      NOW,
    );
    expect(planned.map((plan) => plan.stage)).toEqual(['imminent']);
  });

  it('plans nothing for a deadline inside its own last hour', () => {
    const planned = planDueReminders(
      [task({ dueAt: new Date(NOW + 30 * 60 * 1000).toISOString() })],
      NOW,
    );
    expect(planned).toEqual([]);
  });

  it('plans nothing for an overdue deadline', () => {
    const planned = planDueReminders(
      [task({ dueAt: new Date(NOW - 60 * 60 * 1000).toISOString() })],
      NOW,
    );
    expect(planned).toEqual([]);
  });

  it('ignores tasks with no deadline and unparseable ones', () => {
    expect(planDueReminders([task({ dueAt: null })], NOW)).toEqual([]);
    expect(planDueReminders([task({ dueAt: 'not a date' })], NOW)).toEqual([]);
  });

  it('plans one task once even when it arrives from two lists', () => {
    // My Tasks and Unassigned are disjoint by construction, but the planner is
    // fed their concatenation and must not double-schedule if that ever slips.
    const planned = planDueReminders([task(), task()], NOW);
    expect(planned).toHaveLength(3);
  });

  it('keys a reminder by task and stage so replanning replaces it', () => {
    const first = planDueReminders([task()], NOW);
    const later = planDueReminders([task()], NOW + 60 * 1000);

    expect(first.map((plan) => plan.key)).toEqual(later.map((plan) => plan.key));
    expect(first[0]?.key).toBe(dueReminderKey('task-1', 'day'));
  });

  it('carries the text the reminder needs so the planner is the only source', () => {
    const [first] = planDueReminders([task()], NOW);
    expect(first?.title).toBe('Water the plants');
    expect(first?.listTitle).toBe('Weekly');
  });
});

describe('diffAssignedTasks', () => {
  it('reports nothing against a null baseline', () => {
    // The reading taken at start-up is history, not news: without this the app
    // would announce every task you already own on every launch.
    expect(diffAssignedTasks(null, [{ id: 'a', version: 1 }])).toEqual({
      assigned: [],
      updated: [],
    });
  });

  it('reports a task that was not assigned to me before', () => {
    const changes = diffAssignedTasks(
      [{ id: 'a', version: 1 }],
      [
        { id: 'a', version: 1 },
        { id: 'b', version: 7 },
      ],
    );
    expect(changes).toEqual({ assigned: ['b'], updated: [] });
  });

  it('reports a task of mine whose version advanced', () => {
    const changes = diffAssignedTasks([{ id: 'a', version: 1 }], [{ id: 'a', version: 2 }]);
    expect(changes).toEqual({ assigned: [], updated: ['a'] });
  });

  it('says nothing when a refetch returns identical rows', () => {
    const rows = [
      { id: 'a', version: 4 },
      { id: 'b', version: 9 },
    ];
    expect(diffAssignedTasks(rows, rows)).toEqual({ assigned: [], updated: [] });
  });

  it('says nothing about a task that left my list', () => {
    // Completing or unassigning removes the row. That is not an update.
    expect(diffAssignedTasks([{ id: 'a', version: 1 }], [])).toEqual({
      assigned: [],
      updated: [],
    });
  });

  it('ignores a stale read that reports an older version', () => {
    expect(diffAssignedTasks([{ id: 'a', version: 5 }], [{ id: 'a', version: 3 }])).toEqual({
      assigned: [],
      updated: [],
    });
  });
});
