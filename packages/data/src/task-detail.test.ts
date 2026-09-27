import { describe, expect, it, vi } from 'vitest';

import type { OdinSupabaseClient } from './client.ts';
import { getTask } from './task-detail.ts';

const task = {
  id: 'task-51',
  household_id: 'household',
  list_id: 'list',
  title: 'Later task',
  notes: 'Complete notes',
  sort_order: 51,
  completed: false,
  assignee_id: null,
  due_at: null,
  created_at: '2026-09-27T00:00:00Z',
  updated_at: '2026-09-27T00:00:00Z',
  version: 1,
};

function fixture(data: unknown, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error });
  const eq = vi.fn();
  eq.mockReturnValue({ eq, maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { client: { from } as unknown as OdinSupabaseClient, from, select, eq };
}

describe('task detail read', () => {
  it('loads the complete task directly, restricted to an open parent', async () => {
    const fake = fixture({ ...task, lists: { status: 'open' } });
    expect(await getTask(fake.client, task.id)).toEqual({ ...task, blocked: false });
    expect(fake.from).toHaveBeenCalledWith('tasks');
    expect(fake.select).toHaveBeenCalledWith('*, lists!inner(status)');
    expect(fake.eq.mock.calls).toEqual([
      ['id', task.id],
      ['lists.status', 'open'],
    ]);
  });

  it('uses the same non-disclosing error for absent and inaccessible tasks', async () => {
    await expect(getTask(fixture(null).client, 'absent')).rejects.toMatchObject({
      info: { code: 'NOT_FOUND' },
    });
  });

  it('sanitizes transport errors and rejects malformed rows', async () => {
    await expect(
      getTask(fixture(null, { code: '42501', message: 'private SQL' }).client, 'x'),
    ).rejects.toMatchObject({ info: { code: 'FORBIDDEN', message_key: 'error.forbidden' } });
    await expect(getTask(fixture({ id: 'x' }).client, 'x')).rejects.toMatchObject({
      info: { code: 'UNKNOWN' },
    });
  });
});
