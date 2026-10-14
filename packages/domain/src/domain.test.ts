import { describe, expect, it } from 'vitest';

import type { TaskDto } from '@odin/contracts';

import { avatarHue, initialsOf } from './avatar.ts';
import { isOverdue, localInputToUtcIso, resolveDueInput, utcIsoToLocalInput } from './dates.ts';
import { isListComplete, progressPercent } from './progress.ts';
import { sortTasksByDue, sortTasksInList } from './sorting.ts';
import {
  codePointLength,
  collectIssues,
  normalizeText,
  validateDisplayName,
  validateNotes,
  validateSubtitle,
  validateTaskTitle,
  validateTitle,
} from './validation.ts';

function task(overrides: Partial<TaskDto> & Pick<TaskDto, 'id'>): TaskDto {
  return {
    notes: null,
    household_id: 'h1',
    list_id: 'l1',
    title: 'Task',
    sort_order: 1,
    completed: false,
    assignee_id: null,
    due_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 1,
    ...overrides,
  };
}

describe('date-only deadlines', () => {
  it('defaults a date without time to the final millisecond of the local day', () => {
    const result = resolveDueInput({ dueDate: '2026-06-15', dueTime: '' });
    expect(result.ok).toBe(true);
    if (result.ok && result.dueAt !== null) {
      const parsed = new Date(result.dueAt);
      expect(parsed.getHours()).toBe(23);
      expect(parsed.getMinutes()).toBe(59);
      expect(parsed.getSeconds()).toBe(59);
      expect(parsed.getMilliseconds()).toBe(999);
    }
  });

  it('rejects a time without a date', () => {
    expect(resolveDueInput({ dueDate: '', dueTime: '12:00' })).toEqual({
      ok: false,
      reason: 'invalid_format',
    });
  });
});

/** The minimal shape the due ordering needs; see DueOrdered in sorting.ts. */
function dueRow(
  id: string,
  created_at: string,
  due_at: string | null,
): { id: string; created_at: string; due_at: string | null } {
  return { id, created_at, due_at };
}

const CREATED = '2026-01-01T00:00:00.000Z';

describe('progressPercent', () => {
  // The exact cases docs/contract.md names.
  it.each([
    [0, 0, 0],
    [1, 3, 33],
    [2, 3, 67],
    [1, 8, 13],
    [1, 1, 100],
  ])('%i of %i is %i percent', (completed, total, expected) => {
    expect(progressPercent(completed, total)).toBe(expected);
  });

  it('rounds exact halves up', () => {
    expect(progressPercent(1, 8)).toBe(13); // 12.5 -> 13
    expect(progressPercent(3, 8)).toBe(38); // 37.5 -> 38
  });

  it('treats an empty list as zero rather than dividing by zero', () => {
    expect(progressPercent(0, 0)).toBe(0);
    expect(Number.isNaN(progressPercent(0, 0))).toBe(false);
  });

  it('never exceeds 100 even if counts disagree transiently', () => {
    expect(progressPercent(5, 3)).toBe(100);
  });

  it('rejects negative and non-finite counts', () => {
    expect(() => progressPercent(-1, 3)).toThrow(RangeError);
    expect(() => progressPercent(1, Number.NaN)).toThrow(RangeError);
  });

  it('reports completeness only for non-empty lists', () => {
    expect(isListComplete(0, 0)).toBe(false);
    expect(isListComplete(3, 3)).toBe(true);
  });
});

describe('sortTasksInList', () => {
  it('puts incomplete before complete, then sort_order, then id', () => {
    const sorted = sortTasksInList([
      task({ id: 'b', sort_order: 2 }),
      task({ id: 'a', sort_order: 2, completed: true }),
      task({ id: 'c', sort_order: 1 }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(['c', 'b', 'a']);
  });

  it('breaks ties on id so repeated sorts are stable', () => {
    const sorted = sortTasksInList([
      task({ id: 'z', sort_order: 1 }),
      task({ id: 'a', sort_order: 1 }),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(['a', 'z']);
  });
});

describe('sortTasksByDue', () => {
  it('orders by due date with undated last', () => {
    const sorted = sortTasksByDue([
      dueRow('none', CREATED, null),
      dueRow('late', CREATED, '2026-03-02T10:00:00.000Z'),
      dueRow('early', CREATED, '2026-03-01T10:00:00.000Z'),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(['early', 'late', 'none']);
  });

  it('breaks deadline ties by creation time, oldest first, then task id', () => {
    const sorted = sortTasksByDue([
      dueRow('b', '2026-01-02T00:00:00.000Z', null),
      dueRow('a', '2026-01-02T00:00:00.000Z', null),
      dueRow('c', '2026-01-03T00:00:00.000Z', null),
      dueRow('old', '2026-01-01T00:00:00.000Z', null),
    ]);
    expect(sorted.map((entry) => entry.id)).toEqual(['old', 'a', 'b', 'c']);
  });
});

describe('validation', () => {
  it('counts Unicode code points, not UTF-16 units', () => {
    expect(codePointLength('ключ')).toBe(4);
    expect(codePointLength('👍')).toBe(1);
    expect('👍'.length).toBe(2);
  });

  it('treats whitespace-only text as absent', () => {
    expect(normalizeText('   ')).toBeNull();
    expect(normalizeText(' kept ')).toBe('kept');
    expect(validateTitle('   ')).toEqual({
      field: 'title',
      message_key: 'validation.title.required',
    });
  });

  it('accepts an absent optional subtitle but rejects an over-long one', () => {
    expect(validateSubtitle(null)).toBeNull();
    expect(validateSubtitle('a'.repeat(300))).toBeNull();
    expect(validateSubtitle('a'.repeat(301))).toEqual({
      field: 'subtitle',
      message_key: 'validation.subtitle.length',
    });
  });

  it('bounds titles and display names', () => {
    expect(validateTitle('a'.repeat(160))).toBeNull();
    expect(validateTitle('a'.repeat(161))?.message_key).toBe('validation.title.length');
    expect(validateDisplayName('a'.repeat(81))?.message_key).toBe('validation.display_name.length');
  });

  it('allows longer task titles and bounds notes separately', () => {
    expect(validateTaskTitle('a'.repeat(500))).toBeNull();
    expect(validateTaskTitle('a'.repeat(501))?.message_key).toBe('validation.task_title.length');
    expect(validateNotes('a'.repeat(5000))).toBeNull();
    expect(validateNotes('a'.repeat(5001))?.message_key).toBe('validation.notes.length');
  });

  it('collects only the real issues', () => {
    expect(collectIssues(validateTitle('ok'), validateSubtitle(null))).toEqual([]);
    expect(collectIssues(validateTitle(''), validateSubtitle(null))).toHaveLength(1);
  });
});

describe('dates', () => {
  it('round-trips a local date and time through a UTC instant', () => {
    const parsed = localInputToUtcIso({ date: '2026-06-15', time: '14:30' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(utcIsoToLocalInput(parsed.iso)).toEqual({ date: '2026-06-15', time: '14:30' });
  });

  it('rejects malformed input rather than guessing', () => {
    expect(localInputToUtcIso({ date: '15/06/2026', time: '14:30' })).toEqual({
      ok: false,
      reason: 'invalid_format',
    });
    expect(localInputToUtcIso({ date: '2026-06-15', time: '25:00' })).toEqual({
      ok: false,
      reason: 'invalid_format',
    });
  });

  it('never marks a completed task overdue', () => {
    const now = new Date('2026-06-15T12:00:00.000Z');
    expect(isOverdue({ due_at: '2026-06-14T12:00:00.000Z', completed: true }, now)).toBe(false);
    expect(isOverdue({ due_at: '2026-06-14T12:00:00.000Z', completed: false }, now)).toBe(true);
    expect(isOverdue({ due_at: null, completed: false }, now)).toBe(false);
  });
});

describe('avatar fallback', () => {
  it('derives initials from one or more words, including Cyrillic', () => {
    expect(initialsOf('Ana')).toBe('A');
    expect(initialsOf('Ana Petrova')).toBe('AP');
    expect(initialsOf('  Борис  Иванов ')).toBe('БИ');
    expect(initialsOf('   ')).toBe('?');
  });

  it('spreads household members evenly, whatever order they load in', () => {
    const member = (user_id: string) => ({ user_id, display_name: 'V', avatar_ref: null });
    const household = [member('u2'), member('u1')];
    expect(avatarHue('u1', household)).toBe(0);
    expect(avatarHue('u2', household)).toBe(180);
    expect(avatarHue('u2', [...household].reverse())).toBe(180);
    expect(avatarHue('stranger', household)).toBe(avatarHue('stranger', []));
  });
});
