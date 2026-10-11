import { describe, expect, it } from 'vitest';

import {
  deadlineGroup,
  filterTasks,
  groupTasksByDeadline,
  isTaskView,
  summarizeTasks,
  type ViewTask,
} from './task-views.ts';

// Sunday 11 October 2026, 14:00 local.
const NOW = new Date(2026, 9, 11, 14, 0, 0, 0);

function at(day: number, hour: number, minute = 0): string {
  return new Date(2026, 9, day, hour, minute).toISOString();
}

function task(id: string, overrides: Partial<ViewTask> = {}): ViewTask {
  return {
    id,
    list_id: 'list-a',
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
  const all = { preset: 'all' } as const;

  it('Mine and Unassigned never include done tasks, matching their server reads', () => {
    const mine = filterTasks(tasks, { view: 'mine', userId: 'me', deadline: all, showDone: true });
    expect(mine.map((entry) => entry.id)).toEqual(['mine']);
    const free = filterTasks(tasks, { view: 'unassigned', userId: 'me', deadline: all });
    expect(free.map((entry) => entry.id)).toEqual(['free']);
  });

  it('Everyone shows done tasks only on request', () => {
    const hidden = filterTasks(tasks, { view: 'everyone', userId: 'me', deadline: all });
    expect(hidden).toHaveLength(3);
    const shown = filterTasks(tasks, {
      view: 'everyone',
      userId: 'me',
      deadline: all,
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
      deadline: all,
      search: '  LANDLORD ',
    });
    expect(result.map((entry) => entry.id)).toEqual(['theirs']);
  });

  it('can narrow to blocked work', () => {
    const result = filterTasks(tasks, {
      view: 'everyone',
      userId: 'me',
      deadline: all,
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
    expect(summary).toEqual({ overdue: 1, dueToday: 1, unassigned: 1, blocked: 1, mine: 1 });
  });

  it('recognises view names', () => {
    expect(isTaskView('mine')).toBe(true);
    expect(isTaskView('all')).toBe(false);
    expect(isTaskView(null)).toBe(false);
  });
});
