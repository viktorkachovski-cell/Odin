import { describe, expect, it } from 'vitest';

import {
  parseHome,
  parseListDetail,
  parseMembers,
  parseTask,
  parseTaskCollection,
  parseTaskId,
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
  notes: null,
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

describe('parseHome', () => {
  it('parses the home snapshot carrying both list kinds', () => {
    const home = parseHome({
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
    });
    expect(home.items).toHaveLength(2);
    expect(home.items[0]?.total_tasks).toBe(4);
    expect(home.items[1]?.completed_tasks).toBe(2);
  });

  it('rejects an unexpected list kind', () => {
    expect(() =>
      parseHome({
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
      }),
    ).toThrow(ShapeError);
  });
});

describe('list notes', () => {
  const listRow = {
    id: 'l1',
    household_id: 'h1',
    kind: 'active',
    title: 'Pantry',
    subtitle: 'Weekly',
    status: 'open',
    seed_key: null,
    created_by: 'u1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    version: 1,
  };

  it('reads the shared list note', () => {
    const page = parseListDetail({
      list: { ...listRow, notes: 'Buy the good olive oil' },
      tasks: [],
      total_tasks: 0,
      completed_tasks: 0,
      progress_percent: 0,
    });
    expect(page.list.notes).toBe('Buy the good olive oil');
  });

  it('reads a database that predates the list note as having none', () => {
    const page = parseListDetail({
      list: listRow,
      tasks: [],
      total_tasks: 0,
      completed_tasks: 0,
      progress_percent: 0,
    });
    expect(page.list.notes).toBeNull();
  });

  it('carries the note onto Home cards and tolerates its absence', () => {
    const home = parseHome({
      items: [
        {
          id: 'l1',
          kind: 'template',
          title: 'Weekly cleaning',
          subtitle: null,
          notes: 'Start on Saturday',
          status: 'open',
          version: 1,
          total_tasks: 4,
          completed_tasks: 0,
        },
        {
          id: 'l2',
          kind: 'active',
          title: 'This week',
          subtitle: null,
          status: 'open',
          version: 1,
          total_tasks: 0,
          completed_tasks: 0,
        },
      ],
    });
    expect(home.items[0]?.notes).toBe('Start on Saturday');
    expect(home.items[1]?.notes).toBeNull();
  });
});

describe('parseListDetail', () => {
  it('keeps whole-list totals', () => {
    const page = parseListDetail({
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
    });
    expect(page.total_tasks).toBe(5);
    expect(page.completed_tasks).toBe(1);
    expect(page.progress_percent).toBe(20);
    expect(page.tasks[0]?.blocked).toBe(false);
  });
});

describe('parseTaskCollection', () => {
  const householdRow = { ...task, list_title: 'Weekly cleaning', blocked: true };

  it('parses full task rows with their list title', () => {
    const collection = parseTaskCollection({ items: [householdRow] });
    expect(collection.items[0]?.list_title).toBe('Weekly cleaning');
    expect(collection.items[0]?.id).toBe('t1');
    expect(collection.items[0]?.blocked).toBe(true);
  });

  it('requires the parent list title', () => {
    const withoutTitle: Record<string, unknown> = { ...householdRow };
    delete withoutTitle['list_title'];
    expect(() => parseTaskCollection({ items: [withoutTitle] })).toThrow(ShapeError);
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
