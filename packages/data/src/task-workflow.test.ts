import { describe, expect, it, vi } from 'vitest';

import type { OdinSupabaseClient } from './client.ts';
import { getHomeAll, getAllTasksAll } from './complete-reads.ts';
import { getAllTasks, moveList, moveTask, setTaskStatus } from './task-workflow.ts';

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
  it('carries status, expected version and request id without changing assignment', async () => {
    const { client, rpc } = fixture();
    rpc.mockResolvedValue(success(task));
    expect(
      (
        await setTaskStatus(client, 'request', {
          taskId: 'task',
          expectedVersion: 1,
          status: 'blocked',
        })
      ).ok,
    ).toBe(true);
    expect(rpc).toHaveBeenCalledWith('set_task_status', {
      request_id: 'request',
      task_id: 'task',
      expected_version: 1,
      status: 'blocked',
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

describe('complete filtered reads', () => {
  it('fetches every page with the same overdue instant', async () => {
    const { client, rpc } = fixture();
    rpc
      .mockResolvedValueOnce(success({ items: [task], next_cursor: 'page2' }))
      .mockResolvedValueOnce(success({ items: [{ ...task, id: 'task-51' }], next_cursor: null }));
    const result = await getAllTasksAll(client, { preset: 'overdue' });
    expect(result.items.map((item) => item.id)).toEqual(['task', 'task-51']);
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ p_incomplete_only: true, p_cursor: null });
    expect(rpc.mock.calls[1]?.[1]).toEqual({ ...rpc.mock.calls[0]?.[1], p_cursor: 'page2' });
  });

  it('rejects invalid ranges before issuing a read', () => {
    const { client, rpc } = fixture();
    expect(() =>
      getAllTasks(client, { preset: 'range', from: '2026-02-30', to: '2026-03-01' }),
    ).toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('uses ordered home v2 and rejects repeated cursors instead of silently truncating', async () => {
    const { client, rpc } = fixture();
    rpc.mockResolvedValue(success({ items: [], next_cursor: 'stuck' }));
    await expect(getHomeAll(client)).rejects.toMatchObject({ info: { code: 'UNKNOWN' } });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]?.[0]).toBe('get_home_v2');
  });

  it('does not return partial results when a later page fails', async () => {
    const { client, rpc } = fixture();
    rpc
      .mockResolvedValueOnce(success({ items: [task], next_cursor: 'page2' }))
      .mockResolvedValueOnce({ data: null, error: { code: '42501' } });
    await expect(getAllTasksAll(client, { preset: 'all' })).rejects.toMatchObject({
      info: { code: 'FORBIDDEN' },
    });
  });
});
