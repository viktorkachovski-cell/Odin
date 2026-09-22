import { describe, expect, it, vi } from 'vitest';

import type { OdinSupabaseClient } from './client.ts';
import { createList, saveListTemplate, updateList } from './commands.ts';

const list = {
  id: '00000000-0000-0000-0000-000000000001',
  household_id: '00000000-0000-0000-0000-000000000002',
  kind: 'active',
  title: 'Pantry',
  subtitle: 'Weekly',
  notes: 'Buy the good olive oil',
  status: 'open',
  seed_key: null,
  created_by: '00000000-0000-0000-0000-000000000003',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  version: 1,
};

function clientWithRpc(rpc: ReturnType<typeof vi.fn>): OdinSupabaseClient {
  return { rpc } as unknown as OdinSupabaseClient;
}

describe('note-aware list commands', () => {
  it('uses the additive create RPC when a note is supplied', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, data: list }, error: null });
    const result = await createList(clientWithRpc(rpc), crypto.randomUUID(), {
      title: list.title,
      subtitle: list.subtitle,
      notes: list.notes,
    });

    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      'create_list_v2',
      expect.objectContaining({ notes: 'Buy the good olive oil' }),
    );
  });

  it('keeps the legacy update RPC when a note is omitted by an older flow', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, data: list }, error: null });
    await updateList(clientWithRpc(rpc), crypto.randomUUID(), {
      listId: list.id,
      expectedVersion: 1,
      title: list.title,
      subtitle: list.subtitle,
    });

    expect(rpc).toHaveBeenCalledWith('update_list', expect.any(Object));
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty('notes');
  });

  it('clears a note through the additive RPC rather than the legacy one', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, data: list }, error: null });
    await updateList(clientWithRpc(rpc), crypto.randomUUID(), {
      listId: list.id,
      expectedVersion: 1,
      title: list.title,
      subtitle: null,
      notes: null,
    });

    expect(rpc).toHaveBeenCalledWith('update_list_v2', expect.objectContaining({ notes: null }));
  });
});

describe('saveListTemplate', () => {
  it('sends only the source list and returns the new template id', async () => {
    const templateId = '00000000-0000-0000-0000-0000000000aa';
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: { ok: true, data: { list_id: templateId } }, error: null });
    const requestId = crypto.randomUUID();

    const result = await saveListTemplate(clientWithRpc(rpc), requestId, list.id);

    expect(result).toEqual({ ok: true, data: templateId });
    expect(rpc).toHaveBeenCalledWith('save_list_template', {
      request_id: requestId,
      list_id: list.id,
    });
  });

  it('never writes a task template, so task templates stay loadable on their own', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, data: { list_id: '00000000-0000-0000-0000-0000000000aa' } },
      error: null,
    });

    await saveListTemplate(clientWithRpc(rpc), crypto.randomUUID(), list.id);

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalledWith('save_task_template', expect.anything());
  });
});
