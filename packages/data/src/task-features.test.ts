import { describe, expect, it, vi } from 'vitest';

import type { OdinSupabaseClient } from './client.ts';
import { createTask, updateTask } from './commands.ts';

const task = {
  id: '00000000-0000-0000-0000-000000000001',
  household_id: '00000000-0000-0000-0000-000000000002',
  list_id: '00000000-0000-0000-0000-000000000003',
  title: 'Task',
  notes: 'Shared notes',
  sort_order: 0,
  completed: false,
  assignee_ids: [],
  assignee_id: null,
  due_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  version: 1,
};

function clientWithRpc(rpc: ReturnType<typeof vi.fn>): OdinSupabaseClient {
  return { rpc } as unknown as OdinSupabaseClient;
}

describe('assignment-aware task commands', () => {
  it('creates with the complete assignment set in canonical form', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, data: task }, error: null });
    const result = await createTask(clientWithRpc(rpc), crypto.randomUUID(), {
      listId: task.list_id,
      title: task.title,
      notes: task.notes,
      assigneeIds: ['u2', 'u1', 'u2'],
    });
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      'create_task_v3',
      expect.objectContaining({ notes: 'Shared notes', assignee_ids: ['u1', 'u2'] }),
    );
  });

  it('creates an unassigned task with an empty set, never a null', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, data: task }, error: null });
    await createTask(clientWithRpc(rpc), crypto.randomUUID(), {
      listId: task.list_id,
      title: task.title,
    });
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ assignee_ids: [], due_at: null, notes: null });
  });

  it('saves the editor with the whole set under the expected version', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, data: task }, error: null });
    const requestId = crypto.randomUUID();
    await updateTask(clientWithRpc(rpc), requestId, {
      taskId: task.id,
      expectedVersion: 4,
      title: task.title,
      notes: null,
      assigneeIds: ['b', 'a'],
      dueAt: null,
    });
    expect(rpc).toHaveBeenCalledWith('update_task_v3', {
      request_id: requestId,
      task_id: task.id,
      expected_version: 4,
      title: task.title,
      assignee_ids: ['a', 'b'],
      due_at: null,
      notes: null,
    });
  });

  it('sends the same payload when a retry lists the same people in another order', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, data: task }, error: null });
    const input = { taskId: task.id, expectedVersion: 1, title: 'x', notes: null, dueAt: null };
    await updateTask(clientWithRpc(rpc), 'r', { ...input, assigneeIds: ['a', 'b'] });
    await updateTask(clientWithRpc(rpc), 'r', { ...input, assigneeIds: ['b', 'a', 'a'] });
    expect(rpc.mock.calls[0]?.[1]).toEqual(rpc.mock.calls[1]?.[1]);
  });

  it('parses the assignment set out of the returned task', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, data: { ...task, assignee_id: 'a', assignee_ids: ['a', 'b'] } },
      error: null,
    });
    const result = await updateTask(clientWithRpc(rpc), 'r', {
      taskId: task.id,
      expectedVersion: 1,
      title: 'x',
      notes: null,
      assigneeIds: ['a', 'b'],
      dueAt: null,
    });
    expect(result.ok && result.data.assignee_ids).toEqual(['a', 'b']);
  });
});
