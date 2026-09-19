import { describe, expect, it } from 'vitest';

import {
  parseHome,
  parseListPage,
  parseMembers,
  parseSessionContext,
  parseTask,
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
  created_by: 'u1',
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

describe('parseHome', () => {
  it('parses both sections with their whole-list counts', () => {
    const home = parseHome({
      templates: [
        {
          id: 'l1',
          kind: 'template',
          title: 'Weekly cleaning',
          subtitle: null,
          status: 'open',
          seed_key: 'v1:weekly-cleaning',
          version: 1,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          total: 4,
          completed: 0,
        },
      ],
      active: [],
    });
    expect(home.templates[0]?.total).toBe(4);
    expect(home.active).toEqual([]);
  });

  it('rejects an unexpected list kind', () => {
    expect(() =>
      parseHome({
        templates: [{ ...task, kind: 'archived-thing', total: 0, completed: 0 }],
        active: [],
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
      total: 5,
      completed: 1,
      next_cursor: 'abc',
    });
    expect(page.total).toBe(5);
    expect(page.completed).toBe(1);
    expect(page.next_cursor).toBe('abc');
  });
});

describe('parseTaskPage', () => {
  it('requires the parent list title for cross-list views', () => {
    const page = parseTaskPage({
      tasks: [{ ...task, list_title: 'Weekly cleaning' }],
      next_cursor: null,
    });
    expect(page.tasks[0]?.list_title).toBe('Weekly cleaning');
    expect(() => parseTaskPage({ tasks: [task], next_cursor: null })).toThrow(ShapeError);
  });
});

describe('parseSessionContext', () => {
  it('accepts an account with neither profile nor household yet', () => {
    expect(parseSessionContext({ household: null, profile: null })).toEqual({
      household: null,
      profile: null,
    });
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
