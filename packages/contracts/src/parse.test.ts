import { describe, expect, it } from 'vitest';

import {
  parseHomePage,
  parseListPage,
  parseMembers,
  parseTask,
  parseTaskId,
  parseTaskPage,
  ShapeError,
} from './parse.ts';
import { commandError, isErrorCode, isRetryableWithSameRequestId } from './errors.ts';

const task = {
  id: 't1',
  household_id: 'h1',
  list_id: 'l1',
  title: 'Bathroom',
  sort_order: 2,
  completed: false,
  assignee_id: null,
  due_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  version: 1,
};

describe('parseTask', () => {
  it('accepts a well-formed task and preserves nulls', () => {
    const parsed = parseTask(task);
    expect(parsed.assignee_id).toBeNull();
    expect(parsed.due_at).toBeNull();
    expect(parsed.version).toBe(1);
  });

  it('treats a missing nullable field as null rather than undefined', () => {
    const withoutAssignee: Record<string, unknown> = { ...task };
    delete withoutAssignee['assignee_id'];
    expect(parseTask(withoutAssignee).assignee_id).toBeNull();
  });

  it('rejects a wrong primitive type instead of coercing it', () => {
    expect(() => parseTask({ ...task, version: '1' })).toThrow(ShapeError);
    expect(() => parseTask({ ...task, completed: 'false' })).toThrow(ShapeError);
  });

  it('names the offending field so a shape bug is diagnosable', () => {
    expect(() => parseTask({ ...task, sort_order: null })).toThrow(/sort_order/);
  });
});

describe('delete result parsers', () => {
  it('parses task IDs returned by delete_task', () => {
    expect(parseTaskId({ task_id: 't1' })).toBe('t1');
  });

  it('rejects a delete result without a task ID', () => {
    expect(() => parseTaskId({ list_id: 'l1' })).toThrow(ShapeError);
  });
});

describe('parseHomePage', () => {
  it('parses one paginated page carrying both list kinds', () => {
    const home = parseHomePage({
      items: [
        {
          id: 'l1',
          kind: 'template',
          title: 'Weekly cleaning',
          subtitle: null,
          status: 'open',
          version: 1,
          total_tasks: 4,
          completed_tasks: 0,
        },
        {
          id: 'l2',
          kind: 'active',
          title: 'This week',
          subtitle: 'Shared',
          status: 'open',
          version: 3,
          total_tasks: 5,
          completed_tasks: 2,
        },
      ],
      next_cursor: null,
    });
    expect(home.items).toHaveLength(2);
    expect(home.items[0]?.total_tasks).toBe(4);
    expect(home.items[1]?.completed_tasks).toBe(2);
    expect(home.next_cursor).toBeNull();
  });

  it('rejects an unexpected list kind', () => {
    expect(() =>
      parseHomePage({
        items: [
          {
            id: 'l1',
            kind: 'archived-thing',
            title: 'x',
            subtitle: null,
            status: 'open',
            version: 1,
            total_tasks: 0,
            completed_tasks: 0,
          },
        ],
        next_cursor: null,
      }),
    ).toThrow(ShapeError);
  });
});

describe('parseListPage', () => {
  it('keeps the server cursor and whole-list totals', () => {
    const page = parseListPage({
      list: {
        id: 'l1',
        household_id: 'h1',
        kind: 'active',
        title: 'Weekly cleaning',
        subtitle: null,
        status: 'open',
        seed_key: null,
        created_by: 'u1',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        version: 1,
      },
      tasks: [task],
      total_tasks: 5,
      completed_tasks: 1,
      progress_percent: 20,
      next_cursor: 'abc',
    });
    expect(page.total_tasks).toBe(5);
    expect(page.completed_tasks).toBe(1);
    expect(page.progress_percent).toBe(20);
    expect(page.next_cursor).toBe('abc');
  });
});

describe('parseTaskPage', () => {
  const crossListRow = {
    task_id: 't1',
    list_id: 'l1',
    list_title: 'Weekly cleaning',
    title: 'Bathroom',
    due_at: null,
    has_no_due: true,
    version: 1,
  };

  it('parses the narrower cross-list projection', () => {
    const page = parseTaskPage({ items: [crossListRow], next_cursor: null });
    expect(page.items[0]?.list_title).toBe('Weekly cleaning');
    expect(page.items[0]?.task_id).toBe('t1');
    expect(page.next_cursor).toBeNull();
  });

  it('requires the parent list title', () => {
    const withoutTitle: Record<string, unknown> = { ...crossListRow };
    delete withoutTitle['list_title'];
    expect(() => parseTaskPage({ items: [withoutTitle], next_cursor: null })).toThrow(ShapeError);
  });
});

describe('parseMembers', () => {
  it('parses the identity projection', () => {
    const members = parseMembers([{ user_id: 'u1', display_name: 'Ana', avatar_ref: null }]);
    expect(members).toHaveLength(1);
    expect(members[0]?.display_name).toBe('Ana');
  });

  it('accepts an empty household member list', () => {
    expect(parseMembers([])).toEqual([]);
  });
});

describe('error helpers', () => {
  it('recognises only codes the contract defines', () => {
    expect(isErrorCode('CONFLICT')).toBe(true);
    expect(isErrorCode('MADE_UP')).toBe(false);
  });

  it('derives a default message key from the code', () => {
    expect(commandError('ALREADY_ASSIGNED').message_key).toBe('error.already_assigned');
  });

  it('omits current_version when there is none', () => {
    expect('current_version' in commandError('NOT_FOUND')).toBe(false);
  });

  it('marks only NETWORK as safe to retry under the same request id', () => {
    expect(isRetryableWithSameRequestId(commandError('NETWORK'))).toBe(true);
    expect(isRetryableWithSameRequestId(commandError('CONFLICT'))).toBe(false);
  });
});
