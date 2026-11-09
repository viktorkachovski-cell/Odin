import { useMemo } from 'react';

import type { OdinSupabaseClient } from './client.ts';
import { keysAffectedByProjectChange } from './query-keys.ts';
import { createProject, deleteProject, setListProject, updateProject } from './projects.ts';
import { useCommand } from './use-command.ts';

interface VersionedProject {
  readonly projectId: string;
  readonly expectedVersion: number;
}

/**
 * The project commands both clients offer, wired once with one invalidation
 * set. A project change can regroup lists, so the household summary is
 * refreshed with the project read. Navigation and confirmation stay with the
 * screen through the callbacks.
 */
export function useProjectActions(
  client: OdinSupabaseClient,
  on: {
    readonly created?: (projectId: string) => void;
    readonly removed?: () => void;
  } = {},
) {
  const invalidate = useMemo(() => keysAffectedByProjectChange(), []);
  const create = useCommand(
    (requestId, input: { readonly name: string }) => createProject(client, requestId, input),
    { invalidate, onSuccess: (project) => on.created?.(project.id) },
  );
  const rename = useCommand(
    (requestId, input: VersionedProject & { readonly name: string }) =>
      updateProject(client, requestId, input),
    { invalidate },
  );
  /** The project's lists are kept and ungrouped; only the project goes. */
  const remove = useCommand(
    (requestId, input: VersionedProject) => deleteProject(client, requestId, input),
    { invalidate, onSuccess: () => on.removed?.() },
  );
  /** `projectId` null takes the list out of its project. */
  const moveList = useCommand(
    (
      requestId,
      input: {
        readonly listId: string;
        readonly expectedVersion: number;
        readonly projectId: string | null;
      },
    ) => setListProject(client, requestId, input),
    { invalidate },
  );
  return { create, rename, remove, moveList };
}
