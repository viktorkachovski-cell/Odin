import { useMemo } from 'react';

import type { MoveDirection } from '@odin/contracts';

import type { OdinSupabaseClient } from './client.ts';
import {
  copyTemplate,
  createList,
  createTask,
  deleteList,
  saveListTemplate,
  updateList,
} from './commands.ts';
import { keysAffectedByListChange } from './query-keys.ts';
import { moveList } from './task-workflow.ts';
import { useCommand } from './use-command.ts';

interface ListText {
  readonly title: string;
  readonly subtitle: string | null;
  readonly notes: string | null;
}

interface VersionedList {
  readonly listId: string;
  readonly expectedVersion: number;
}

/**
 * The list commands both clients offer, wired once with one invalidation set.
 * Pass the list id on list detail so only its own read is refreshed; `update`
 * and `addTask` act on that list. Navigation and confirmation stay with the
 * screen through the callbacks.
 */
export function useListActions(
  client: OdinSupabaseClient,
  listId?: string,
  on: {
    /** A new list exists, created or copied from a template. */
    readonly opened?: (listId: string) => void;
    readonly templateSaved?: () => void;
    readonly deleted?: () => void;
  } = {},
) {
  const invalidate = useMemo(() => keysAffectedByListChange(listId), [listId]);
  const create = useCommand((requestId, input: ListText) => createList(client, requestId, input), {
    invalidate,
    onSuccess: (list) => on.opened?.(list.id),
  });
  const copy = useCommand(
    (requestId, templateId: string) => copyTemplate(client, requestId, templateId),
    { invalidate, onSuccess: (id) => on.opened?.(id) },
  );
  const update = useCommand(
    (requestId, input: ListText & { readonly expectedVersion: number }) =>
      updateList(client, requestId, { listId: listId ?? '', ...input }),
    { invalidate },
  );
  /** The source list is unchanged, so it keeps its version. */
  const saveTemplate = useCommand(
    (requestId, sourceId: string) => saveListTemplate(client, requestId, sourceId),
    { invalidate, onSuccess: () => on.templateSaved?.() },
  );
  const move = useCommand(
    (requestId, input: VersionedList & { readonly direction: MoveDirection }) =>
      moveList(client, requestId, input),
    { invalidate },
  );
  const remove = useCommand(
    (requestId, input: VersionedList) => deleteList(client, requestId, input),
    { invalidate, onSuccess: () => on.deleted?.() },
  );
  /** Quick add: a title only; details come from the task editor. */
  const addTask = useCommand(
    (requestId, title: string) =>
      createTask(client, requestId, { listId: listId ?? '', title, notes: '' }),
    { invalidate },
  );
  return { create, copy, update, saveTemplate, move, remove, addTask };
}
