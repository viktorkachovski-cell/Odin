import type { AllTaskPageDto, HomePageDto, ListPageDto, TaskPageDto } from '@odin/contracts';
import type { TaskDeadlineFilter } from '@odin/domain';

import type { OdinSupabaseClient } from './client.ts';
import { OdinError } from './error-mapping.ts';
import { getHome, getList, getMyTasks, getUnassigned } from './repositories.ts';
import { getAllTasks } from './task-workflow.ts';

/** Read each keyset page; never present a failed or looping page chain as a complete result. */
async function collectPages<P extends { readonly next_cursor: string | null }>(
  read: (cursor: string | null) => Promise<P>,
): Promise<P[]> {
  const pages: P[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = await read(cursor);
    pages.push(page);
    cursor = page.next_cursor;
    if (cursor !== null) {
      if (cursors.has(cursor))
        throw new OdinError({ code: 'UNKNOWN', message_key: 'error.unknown' });
      cursors.add(cursor);
    }
  } while (cursor !== null);
  return pages;
}

function unique<T>(items: readonly T[], id: (item: T) => string): T[] {
  return [...new Map(items.map((item) => [id(item), item])).values()];
}

export async function getHomeAll(client: OdinSupabaseClient): Promise<HomePageDto> {
  const pages = await collectPages((cursor) => getHome(client, cursor));
  return {
    items: unique(
      pages.flatMap((page) => page.items),
      (item) => item.id,
    ),
    next_cursor: null,
  };
}

export async function getListAll(client: OdinSupabaseClient, listId: string): Promise<ListPageDto> {
  const pages = await collectPages((cursor) => getList(client, listId, cursor));
  const first = pages[0];
  if (first === undefined)
    throw new OdinError({ code: 'NOT_FOUND', message_key: 'error.not_found' });
  return {
    ...first,
    tasks: unique(
      pages.flatMap((page) => page.tasks),
      (task) => task.id,
    ),
    next_cursor: null,
  };
}

async function crossListAll(
  read: (cursor: string | null) => Promise<TaskPageDto>,
): Promise<TaskPageDto> {
  const pages = await collectPages(read);
  return {
    items: unique(
      pages.flatMap((page) => page.items),
      (task) => task.task_id,
    ),
    next_cursor: null,
  };
}

export function getMyTasksAll(client: OdinSupabaseClient): Promise<TaskPageDto> {
  return crossListAll((cursor) => getMyTasks(client, cursor));
}

export function getUnassignedAll(client: OdinSupabaseClient): Promise<TaskPageDto> {
  return crossListAll((cursor) => getUnassigned(client, cursor));
}

export async function getAllTasksAll(
  client: OdinSupabaseClient,
  filter: TaskDeadlineFilter,
): Promise<AllTaskPageDto> {
  const now = new Date();
  const pages = await collectPages((cursor) => getAllTasks(client, filter, cursor, now));
  return {
    items: unique(
      pages.flatMap((page) => page.items),
      (task) => task.id,
    ),
    next_cursor: null,
  };
}
