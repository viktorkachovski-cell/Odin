import { describe, expect, it, vi } from 'vitest';

import type { OdinSupabaseClient } from './client.ts';
import { getAllTasks, getHome, getList, getMyTasks } from './repositories.ts';
import { moveList, moveTask, setTaskState } from './task-workflow.ts';

const task = {
  id: 'task',
  household_id: 'household',
  list_id: 'list',
  list_title: 'List',
  title: 'Task',
  notes: null,
  sort_order: 0,
  completed: false,
  blocked: true,
  assignee_id: null,
  due_at: null,
  created_at: '2026-09-27T00:00:00Z',
  updated_at: '2026-09-27T00:00:00Z',
  version: 2,
};
const success = (data: unknown) => ({ data: { ok: true, data }, error: null });
function fixture() {
  const rpc = vi.fn();
  return { rpc, client: { rpc } as unknown as OdinSupabaseClient };
}

describe('workflow commands', () => {
  it('sends the stored state, never a display label, with version and request id', async () => {
    const { client, rpc } = fixture();
    rpc.mockResolvedValue(success(task));
    const result = await setTaskState(client, 'request', {
      taskId: 'task',
      expectedVersion: 1,
      state: 'open',
    });
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith('set_task_state', {
      request_id: 'request',
      task_id: 'task',
      expected_version: 1,
      state: 'open',
    });
  });

  it('moves each entity with version protection and a stable request envelope', async () => {
    const { client, rpc } = fixture();
    rpc
      .mockResolvedValueOnce(success({ task_id: 'task' }))
      .mockResolvedValueOnce(success({ list_id: 'list' }));
    expect(
      await moveTask(client, 'a', { taskId: 'task', expectedVersion: 2, direction: 'up' }),
    ).toEqual({ ok: true, data: 'task' });
    expect(
      await moveList(client, 'b', { listId: 'list', expectedVersion: 3, direction: 'down' }),
    ).toEqual({ ok: true, data: 'list' });
    expect(rpc.mock.calls).toEqual([
      ['move_task', { request_id: 'a', task_id: 'task', expected_version: 2, direction: 'up' }],
      ['move_list', { request_id: 'b', list_id: 'list', expected_version: 3, direction: 'down' }],
    ]);
  });
});

describe('snapshot reads', () => {
  it('reads each collection in one call, with no cursor', async () => {
    const { client, rpc } = fixture();
    rpc
      .mockResolvedValueOnce(success({ items: [] }))
      .mockResolvedValueOnce(
        success({
          list: {
            id: 'list',
            household_id: 'household',
            kind: 'active',
            title: 'List',
            subtitle: null,
            notes: null,
            status: 'open',
            sort_order: 0,
            seed_key: null,
            created_by: 'member',
            created_at: '2026-09-27T00:00:00Z',
            updated_at: '2026-09-27T00:00:00Z',
            version: 1,
          },
          total_tasks: 1,
          completed_tasks: 0,
          progress_percent: 0,
          tasks: [task],
        }),
      )
      .mockResolvedValueOnce(success({ items: [task] }));

    expect((await getHome(client)).items).toEqual([]);
    expect((await getList(client, 'list')).tasks[0]?.blocked).toBe(true);
    expect((await getMyTasks(client)).items[0]?.list_title).toBe('List');
    expect(rpc.mock.calls).toEqual([
      ['get_home_v2', undefined],
      ['get_list_v2', { p_list_id: 'list' }],
      ['get_my_tasks_v2', undefined],
    ]);
  });

  it('resolves deadline filters against one instant', async () => {
    const { client, rpc } = fixture();
    rpc.mockResolvedValue(success({ items: [task] }));
    const now = new Date(2026, 8, 27, 12, 30);
    const result = await getAllTasks(client, { preset: 'overdue' }, now);
    expect(result.items.map((item) => item.id)).toEqual(['task']);
    expect(rpc).toHaveBeenCalledWith('get_all_tasks', {
      p_due_from: null,
      p_due_before: now.toISOString(),
      p_undated: false,
      p_incomplete_only: true,
    });
  });

  it('rejects invalid ranges before issuing a read', async () => {
    const { client, rpc } = fixture();
    await expect(
      getAllTasks(client, { preset: 'range', from: '2026-02-30', to: '2026-03-01' }),
    ).rejects.toMatchObject({ info: { code: 'VALIDATION', message_key: 'filter.date.invalid' } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('surfaces an oversized collection as TOO_LARGE rather than a partial result', async () => {
    const { client, rpc } = fixture();
    rpc.mockResolvedValue({
      data: { ok: false, error: { code: 'TOO_LARGE', message_key: 'error.too_large' } },
      error: null,
    });
    await expect(getAllTasks(client, { preset: 'all' })).rejects.toMatchObject({
      info: { code: 'TOO_LARGE', message_key: 'error.too_large' },
    });
  });
});
