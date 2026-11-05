import { describe, expect, it } from 'vitest';

import {
  deadlineGroup,
  filterTasks,
  groupMyTasksForToday,
  groupTasksByDeadline,
  isTaskView,
  summarizeTasks,
  type ViewTask,
} from './task-views.ts';
import { isTaskDeadlinePreset } from './task-workflow.ts';

// Sunday 11 October 2026, 14:00 local.
const NOW = new Date(2026, 9, 11, 14, 0, 0, 0);

function at(day: number, hour: number, minute = 0): string {
  return new Date(2026, 9, day, hour, minute).toISOString();
}

function task(id: string, overrides: Partial<ViewTask> = {}): ViewTask {
  return {
    id,
    created_at: at(1, 0),
    title: `Task ${id}`,
    notes: null,
    completed: false,
    blocked: false,
    assignee_id: null,
    due_at: null,
    list_title: 'Home',
    ...overrides,
  };
}

describe('deadline groups', () => {
  it('puts every task in exactly one group', () => {
    expect(deadlineGroup(task('a', { due_at: at(9, 10) }), NOW)).toBe('overdue');
    expect(deadlineGroup(task('b', { due_at: at(11, 9) }), NOW)).toBe('overdue');
    expect(deadlineGroup(task('c', { due_at: at(11, 18) }), NOW)).toBe('today');
    expect(deadlineGroup(task('d', { due_at: at(12, 0) }), NOW)).toBe('upcoming');
    expect(deadlineGroup(task('e'), NOW)).toBe('undated');
    expect(deadlineGroup(task('f', { due_at: at(1, 9), completed: true }), NOW)).toBe('done');
  });

  it('renders non-empty groups in order, each due-ascending with undated last', () => {
    const groups = groupTasksByDeadline(
      [
        task('late', { due_at: at(12, 9) }),
        task('none'),
        task('soon', { due_at: at(11, 16) }),
        task('early', { due_at: at(11, 15) }),
        task('past', { due_at: at(10, 9) }),
      ],
      NOW,
    );
    expect(groups.map((entry) => entry.group)).toEqual(['overdue', 'today', 'upcoming', 'undated']);
    expect(groups[1]?.tasks.map((entry) => entry.id)).toEqual(['early', 'soon']);
  });
});

describe('task view filter', () => {
  const tasks = [
    task('mine', { assignee_id: 'me', due_at: at(11, 18) }),
    task('mine-done', { assignee_id: 'me', completed: true }),
    task('theirs', { assignee_id: 'other', blocked: true, notes: 'Waiting for the landlord' }),
    task('free', { due_at: at(9, 9) }),
    task('free-done', { completed: true, due_at: at(9, 9) }),
  ];

  it('Mine and Unassigned never include done tasks, matching their server reads', () => {
    const mine = filterTasks(tasks, { view: 'mine', userId: 'me', showDone: true });
    expect(mine.map((entry) => entry.id)).toEqual(['mine']);
    const free = filterTasks(tasks, { view: 'unassigned', userId: 'me' });
    expect(free.map((entry) => entry.id)).toEqual(['free']);
  });

  it('Everyone shows done tasks only on request', () => {
    const hidden = filterTasks(tasks, { view: 'everyone', userId: 'me' });
    expect(hidden).toHaveLength(3);
    const shown = filterTasks(tasks, {
      view: 'everyone',
      userId: 'me',
      showDone: true,
    });
    expect(shown).toHaveLength(5);
  });

  it('applies the server deadline semantics, including overdue excluding done', () => {
    const overdue = filterTasks(
      tasks,
      { view: 'everyone', userId: 'me', deadline: { preset: 'overdue' }, showDone: true },
      NOW,
    );
    expect(overdue.map((entry) => entry.id)).toEqual(['free']);
    const undated = filterTasks(
      tasks,
      { view: 'everyone', userId: 'me', deadline: { preset: 'undated' } },
      NOW,
    );
    expect(undated.map((entry) => entry.id)).toEqual(['theirs']);
    const range = filterTasks(
      tasks,
      {
        view: 'everyone',
        userId: 'me',
        deadline: { preset: 'range', from: '2026-10-11', to: '2026-10-11' },
      },
      NOW,
    );
    expect(range.map((entry) => entry.id)).toEqual(['mine']);
  });

  it('rejects an invalid range rather than showing everything', () => {
    const result = filterTasks(tasks, {
      view: 'everyone',
      userId: 'me',
      deadline: { preset: 'range', from: '2026-10-12', to: '2026-10-11' },
    });
    expect(result).toEqual([]);
  });

  it('searches title, notes and list title case-insensitively', () => {
    const result = filterTasks(tasks, {
      view: 'everyone',
      userId: 'me',
      search: '  LANDLORD ',
    });
    expect(result.map((entry) => entry.id)).toEqual(['theirs']);
  });

  it('can narrow to blocked work', () => {
    const result = filterTasks(tasks, {
      view: 'everyone',
      userId: 'me',
      blockedOnly: true,
    });
    expect(result.map((entry) => entry.id)).toEqual(['theirs']);
  });
});

describe('summary', () => {
  it('counts open work only', () => {
    const summary = summarizeTasks(
      [
        task('a', { due_at: at(9, 9) }),
        task('b', { due_at: at(11, 20), assignee_id: 'me' }),
        task('c', { blocked: true, assignee_id: 'other' }),
        task('d', { completed: true, due_at: at(9, 9) }),
      ],
      'me',
      NOW,
    );
    expect(summary).toEqual({
      overdue: 1,
      dueToday: 1,
      unassigned: 1,
      blocked: 1,
      mine: 1,
      everyone: 3,
    });
  });

  it("leaves Today's undated work to a count unless it is all the member has", () => {
    const dated = groupMyTasksForToday(
      [
        task('soon', { assignee_id: 'me', due_at: at(11, 18) }),
        task('someday', { assignee_id: 'me' }),
        task('theirs', { assignee_id: 'other', due_at: at(11, 18) }),
      ],
      'me',
      NOW,
    );
    expect(dated.groups.map((entry) => entry.group)).toEqual(['today']);
    expect(dated).toMatchObject({ undated: 1, total: 2 });

    const undated = groupMyTasksForToday([task('someday', { assignee_id: 'me' })], 'me', NOW);
    expect(undated.groups.map((entry) => entry.group)).toEqual(['undated']);
    expect(undated).toMatchObject({ undated: 0, total: 1 });
  });

  it('recognises view names', () => {
    expect(isTaskView('mine')).toBe(true);
    expect(isTaskView('all')).toBe(false);
    expect(isTaskView(null)).toBe(false);
    expect(isTaskDeadlinePreset('overdue')).toBe(true);
    expect(isTaskDeadlinePreset('soon')).toBe(false);
    expect(isTaskDeadlinePreset(undefined)).toBe(false);
  });
});

describe('views with several assignees', () => {
  const shared = task('shared', { assignee_id: 'a', assignee_ids: ['a', 'b'], due_at: at(11, 18) });
  const solo = task('solo', { assignee_id: 'a', assignee_ids: ['a'] });
  const nobody = task('nobody', { assignee_id: null, assignee_ids: [] });
  const done = task('done', { assignee_id: 'a', assignee_ids: ['a', 'b'], completed: true });
  const tasks = [shared, solo, nobody, done];

  it('shows a shared task in the Mine view of every assignee, once', () => {
    for (const member of ['a', 'b']) {
      const mine = filterTasks(tasks, { view: 'mine', userId: member }, NOW);
      expect(mine.filter((entry) => entry.id === 'shared')).toHaveLength(1);
    }
    expect(filterTasks(tasks, { view: 'mine', userId: 'b' }, NOW).map((t) => t.id)).toEqual([
      'shared',
    ]);
    expect(filterTasks(tasks, { view: 'mine', userId: 'c' }, NOW)).toEqual([]);
  });

  it('judges Mine by membership of the set, not by the legacy single assignee', () => {
    const second = task('second', { assignee_id: 'a', assignee_ids: ['a', 'me'] });
    expect(filterTasks([second], { view: 'mine', userId: 'me' }, NOW)).toEqual([second]);
  });

  it('lists only tasks with nobody on them as Unassigned', () => {
    expect(filterTasks(tasks, { view: 'unassigned', userId: 'a' }, NOW).map((t) => t.id)).toEqual([
      'nobody',
    ]);
  });

  it('keeps one task in Everyone however many people are on it', () => {
    expect(filterTasks(tasks, { view: 'everyone', userId: 'a' }, NOW).map((t) => t.id)).toEqual([
      'shared',
      'solo',
      'nobody',
    ]);
  });

  it('counts a shared task once overall and once for each member', () => {
    const forA = summarizeTasks(tasks, 'a', NOW);
    const forB = summarizeTasks(tasks, 'b', NOW);
    expect(forA).toMatchObject({ everyone: 3, mine: 2, unassigned: 1 });
    expect(forB).toMatchObject({ everyone: 3, mine: 1, unassigned: 1 });
  });

  it('moves a task to Unassigned when everyone is removed, and out of Mine', () => {
    const cleared = { ...shared, assignee_id: null, assignee_ids: [] };
    expect(summarizeTasks([cleared], 'a', NOW)).toMatchObject({ mine: 0, unassigned: 1 });
  });

  it("builds Today from the member's own open tasks across a shared task", () => {
    const today = groupMyTasksForToday(tasks, 'b', NOW);
    expect(today.total).toBe(1);
    expect(today.groups.flatMap((group) => group.tasks.map((t) => t.id))).toEqual(['shared']);
  });
});
