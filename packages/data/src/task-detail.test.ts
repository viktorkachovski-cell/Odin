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
  assignee_ids: [],
  assignee_id: null,
  due_at: null,
  created_at: '2026-09-27T00:00:00Z',
  updated_at: '2026-09-27T00:00:00Z',
  version: 1,
};

function fixture(response: unknown) {
  const rpc = vi.fn().mockResolvedValue(response);
  return { client: { rpc } as unknown as OdinSupabaseClient, rpc };
}

describe('task detail read', () => {
  it('loads the complete task, assignment set included, through the server read', async () => {
    const fake = fixture({
      data: { ok: true, data: { ...task, assignee_id: 'a', assignee_ids: ['a', 'b'] } },
      error: null,
    });
    expect(await getTask(fake.client, task.id)).toEqual({
      ...task,
      blocked: false,
      assignee_id: 'a',
      assignee_ids: ['a', 'b'],
    });
    expect(fake.rpc).toHaveBeenCalledWith('get_task_v2', { p_task_id: task.id });
  });

  it('uses the same non-disclosing error for absent and inaccessible tasks', async () => {
    const fake = fixture({
      data: { ok: false, error: { code: 'NOT_FOUND', message_key: 'error.not_found' } },
      error: null,
    });
    await expect(getTask(fake.client, 'absent')).rejects.toMatchObject({
      info: { code: 'NOT_FOUND' },
    });
  });

  it('sanitizes transport errors and rejects malformed rows', async () => {
    await expect(
      getTask(
        fixture({ data: null, error: { code: '42501', message: 'private SQL' } }).client,
        'x',
      ),
    ).rejects.toMatchObject({ info: { code: 'FORBIDDEN', message_key: 'error.forbidden' } });
    await expect(
      getTask(fixture({ data: { ok: true, data: { id: 'x' } }, error: null }).client, 'x'),
    ).rejects.toMatchObject({ info: { code: 'UNKNOWN' } });
  });
});
