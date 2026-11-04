import { describe, expect, it, vi } from 'vitest';

import type { OdinSupabaseClient } from './client.ts';
import { addTaskAssignee, removeTaskAssignee, setTaskAssignees } from './task-assignment.ts';

const task = {
  id: 't1',
  household_id: 'h1',
  list_id: 'l1',
  title: 'Task',
  notes: null,
  sort_order: 0,
  completed: false,
  blocked: true,
  assignee_ids: ['a', 'b'],
  assignee_id: 'a',
  due_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  version: 3,
};

function client(response: unknown) {
  const rpc = vi.fn().mockResolvedValue(response);
  return { rpc, client: { rpc } as unknown as OdinSupabaseClient };
}

describe('assignment commands', () => {
  it('replaces the set under a version, canonically, and returns the task', async () => {
    const fake = client({ data: { ok: true, data: task }, error: null });
    const result = await setTaskAssignees(fake.client, 'req', {
      taskId: 't1',
      expectedVersion: 2,
      assigneeIds: ['b', 'a', 'b'],
    });
    expect(fake.rpc).toHaveBeenCalledWith('set_task_assignees', {
      request_id: 'req',
      task_id: 't1',
      expected_version: 2,
      assignee_ids: ['a', 'b'],
    });
    expect(result.ok && result.data).toMatchObject({ assignee_ids: ['a', 'b'], blocked: true });
  });

  it('clears everyone with an empty set, not a null', async () => {
    const fake = client({ data: { ok: true, data: { ...task, assignee_ids: [] } }, error: null });
    await setTaskAssignees(fake.client, 'req', {
      taskId: 't1',
      expectedVersion: 2,
      assigneeIds: [],
    });
    expect(fake.rpc.mock.calls[0]?.[1]).toMatchObject({ assignee_ids: [] });
  });

  it('adds and removes one member without a version', async () => {
    const fake = client({ data: { ok: true, data: task }, error: null });
    await addTaskAssignee(fake.client, 'r1', { taskId: 't1', userId: 'c' });
    await removeTaskAssignee(fake.client, 'r2', { taskId: 't1', userId: 'a' });
    expect(fake.rpc).toHaveBeenNthCalledWith(1, 'add_task_assignee', {
      request_id: 'r1',
      task_id: 't1',
      user_id: 'c',
    });
    expect(fake.rpc).toHaveBeenNthCalledWith(2, 'remove_task_assignee', {
      request_id: 'r2',
      task_id: 't1',
      user_id: 'a',
    });
  });

  it('surfaces a replacement conflict with the current version, never as success', async () => {
    const fake = client({
      data: {
        ok: false,
        error: { code: 'CONFLICT', message_key: 'error.conflict', current_version: 5 },
      },
      error: null,
    });
    const result = await setTaskAssignees(fake.client, 'req', {
      taskId: 't1',
      expectedVersion: 2,
      assigneeIds: [],
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'CONFLICT', current_version: 5 } });
  });

  it('keeps an unknown commit outcome retryable under the same request id', async () => {
    const rpc = vi.fn().mockRejectedValue(new TypeError('Network request failed'));
    const result = await addTaskAssignee({ rpc } as unknown as OdinSupabaseClient, 'r1', {
      taskId: 't1',
      userId: 'c',
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'NETWORK' } });
  });
});
