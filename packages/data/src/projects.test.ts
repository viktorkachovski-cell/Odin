import { describe, expect, it, vi } from 'vitest';

import type { OdinSupabaseClient } from './client.ts';
import { createList } from './commands.ts';
import {
  createProject,
  deleteProject,
  getProjects,
  setListProject,
  updateProject,
} from './projects.ts';
import {
  keysAffectedByChanges,
  keysAffectedByListChange,
  keysAffectedByProjectChange,
  queryKeys,
} from './query-keys.ts';

const project = {
  id: '00000000-0000-0000-0000-000000000010',
  household_id: '00000000-0000-0000-0000-000000000002',
  name: 'Home renovation',
  created_by: '00000000-0000-0000-0000-000000000003',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  version: 1,
};

const list = {
  id: '00000000-0000-0000-0000-000000000011',
  household_id: project.household_id,
  project_id: project.id,
  kind: 'active',
  title: 'Kitchen',
  subtitle: null,
  notes: null,
  status: 'open',
  seed_key: null,
  created_by: project.created_by,
  created_at: project.created_at,
  updated_at: project.updated_at,
  version: 3,
};

function clientWithRpc(rpc: ReturnType<typeof vi.fn>): OdinSupabaseClient {
  return { rpc } as unknown as OdinSupabaseClient;
}

const ok = (data: unknown) => vi.fn().mockResolvedValue({ data: { ok: true, data }, error: null });

describe('project commands', () => {
  it('creates a project from its name only', async () => {
    const rpc = ok(project);
    const requestId = crypto.randomUUID();

    const result = await createProject(clientWithRpc(rpc), requestId, { name: project.name });

    expect(result).toEqual({ ok: true, data: project });
    expect(rpc).toHaveBeenCalledWith('create_project', {
      request_id: requestId,
      name: project.name,
    });
  });

  it('renames under the version the member saw', async () => {
    const rpc = ok({ ...project, name: 'Renovation', version: 2 });
    const requestId = crypto.randomUUID();

    await updateProject(clientWithRpc(rpc), requestId, {
      projectId: project.id,
      expectedVersion: 1,
      name: 'Renovation',
    });

    expect(rpc).toHaveBeenCalledWith('update_project', {
      request_id: requestId,
      project_id: project.id,
      expected_version: 1,
      name: 'Renovation',
    });
  });

  it('deletes a project and returns its id', async () => {
    const rpc = ok({ project_id: project.id });
    const requestId = crypto.randomUUID();

    const result = await deleteProject(clientWithRpc(rpc), requestId, {
      projectId: project.id,
      expectedVersion: 4,
    });

    expect(result).toEqual({ ok: true, data: project.id });
    expect(rpc).toHaveBeenCalledWith('delete_project', {
      request_id: requestId,
      project_id: project.id,
      expected_version: 4,
    });
  });

  it('moves a list into a project, or out with null', async () => {
    const rpc = ok(list);
    const client = clientWithRpc(rpc);

    await setListProject(client, crypto.randomUUID(), {
      listId: list.id,
      expectedVersion: 3,
      projectId: project.id,
    });
    await setListProject(client, crypto.randomUUID(), {
      listId: list.id,
      expectedVersion: 3,
      projectId: null,
    });

    expect(rpc.mock.calls[0]?.[0]).toBe('set_list_project');
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({ project_id: project.id });
    expect(rpc.mock.calls[1]?.[1]).toMatchObject({ project_id: null });
  });

  it('returns a conflict as a value so the editor keeps its input', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: false,
        error: { code: 'CONFLICT', message_key: 'error.conflict', current_version: 2 },
      },
      error: null,
    });

    const result = await updateProject(clientWithRpc(rpc), crypto.randomUUID(), {
      projectId: project.id,
      expectedVersion: 1,
      name: 'Stale',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CONFLICT');
  });
});

describe('getProjects', () => {
  it('reads the snapshot with each project list count', async () => {
    const rpc = ok({ items: [{ ...project, list_count: 2 }] });

    const result = await getProjects(clientWithRpc(rpc));

    expect(rpc).toHaveBeenCalledWith('get_projects', undefined);
    expect(result.items).toEqual([{ ...project, list_count: 2 }]);
  });

  it('refuses a payload without a list count', async () => {
    const rpc = ok({ items: [project] });

    await expect(getProjects(clientWithRpc(rpc))).rejects.toThrow();
  });
});

describe('createList with a project', () => {
  it('keeps the legacy RPCs when no project is supplied', async () => {
    const rpc = ok(list);
    const client = clientWithRpc(rpc);

    await createList(client, crypto.randomUUID(), { title: 'A' });
    await createList(client, crypto.randomUUID(), { title: 'A', notes: null });

    expect(rpc.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      'create_list',
      'create_list_v2',
    ]);
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty('project_id');
    expect(rpc.mock.calls[1]?.[1]).not.toHaveProperty('project_id');
  });

  it('creates inside a project atomically through create_list_v3', async () => {
    const rpc = ok(list);

    await createList(clientWithRpc(rpc), crypto.randomUUID(), {
      title: 'Kitchen',
      projectId: project.id,
    });

    expect(rpc).toHaveBeenCalledWith(
      'create_list_v3',
      expect.objectContaining({ project_id: project.id, notes: null, title: 'Kitchen' }),
    );
  });

  it('sends an explicit null project through create_list_v3 as well', async () => {
    const rpc = ok(list);

    await createList(clientWithRpc(rpc), crypto.randomUUID(), { title: 'Loose', projectId: null });

    expect(rpc).toHaveBeenCalledWith(
      'create_list_v3',
      expect.objectContaining({ project_id: null }),
    );
  });
});

describe('project cache invalidation', () => {
  const ids = (keys: readonly (readonly string[])[]) => keys.map((key) => key.join('/')).sort();

  it('refreshes the project read and the household summary when a project changes', () => {
    expect(ids(keysAffectedByProjectChange())).toEqual(['home', 'list', 'projects']);
  });

  it('refreshes project counts when a list changes', () => {
    expect(ids(keysAffectedByListChange())).toContain('projects');
  });

  it('maps a realtime project hint to the project keys', () => {
    expect(ids(keysAffectedByChanges(['project']))).toEqual(['home', 'list', 'projects']);
    expect(queryKeys.projects).toEqual(['projects']);
  });
});
