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
  assignee_id: null,
  due_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  version: 1,
};

function clientWithRpc(rpc: ReturnType<typeof vi.fn>): OdinSupabaseClient {
  return { rpc } as unknown as OdinSupabaseClient;
}

describe('note-aware task commands', () => {
  it('uses the additive create RPC when notes are supplied', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, data: task }, error: null });
    const result = await createTask(clientWithRpc(rpc), crypto.randomUUID(), {
      listId: task.list_id,
      title: task.title,
      notes: task.notes,
    });
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      'create_task_v2',
      expect.objectContaining({ notes: 'Shared notes' }),
    );
  });

  it('keeps the legacy update RPC when notes are omitted by an older flow', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, data: task }, error: null });
    await updateTask(clientWithRpc(rpc), crypto.randomUUID(), {
      taskId: task.id,
      expectedVersion: 1,
      title: task.title,
      assigneeId: null,
      dueAt: null,
    });
    expect(rpc).toHaveBeenCalledWith('update_task', expect.any(Object));
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty('notes');
  });
});
