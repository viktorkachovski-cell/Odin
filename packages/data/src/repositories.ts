/**
 * Read side. Pure functions over a client so they stay testable without
 * rendering; the React hooks in this package wrap them.
 *
 * Household scope is never passed in from the caller: the server derives it
 * from the authenticated session and its active membership.
 */

import type {
  HomeDto,
  ListPageDto,
  MemberDto,
  SessionContextDto,
  TaskPageDto,
} from '@odin/contracts';
import {
  parseHome,
  parseListPage,
  parseMembers,
  parseSessionContext,
  parseTaskPage,
} from '@odin/contracts';

import type { OdinSupabaseClient } from './client.ts';
import { mapPostgrestError, OdinError, toOdinError } from './error-mapping.ts';

async function callRpc(
  client: OdinSupabaseClient,
  fn: string,
  args?: Record<string, unknown>,
): Promise<unknown> {
  try {
    // The generated Args types are per-function unions; the repositories below
    // are the only callers and each passes the arguments that function declares.
    const response = await (
      client.rpc as unknown as (
        name: string,
        params?: Record<string, unknown>,
      ) => PromiseLike<{ data: unknown; error: unknown }>
    )(fn, args);

    if (response.error !== null && response.error !== undefined) {
      throw new OdinError(mapPostgrestError(response.error));
    }
    return response.data;
  } catch (cause) {
    throw toOdinError(cause);
  }
}

export async function getSession(client: OdinSupabaseClient): Promise<string | null> {
  const { data, error } = await client.auth.getSession();
  if (error !== null) throw new OdinError(mapPostgrestError(error));
  return data.session?.user.id ?? null;
}

export async function getMyHousehold(client: OdinSupabaseClient): Promise<SessionContextDto> {
  return parseSessionContext(await callRpc(client, 'get_my_household'));
}

export async function getMembers(client: OdinSupabaseClient): Promise<MemberDto[]> {
  return parseMembers(await callRpc(client, 'get_members'));
}

export async function getHome(client: OdinSupabaseClient): Promise<HomeDto> {
  return parseHome(await callRpc(client, 'get_home'));
}

export async function getList(
  client: OdinSupabaseClient,
  listId: string,
  cursor?: string | null,
): Promise<ListPageDto> {
  return parseListPage(
    await callRpc(client, 'get_list', {
      p_list_id: listId,
      ...(cursor === null || cursor === undefined ? {} : { p_cursor: cursor }),
    }),
  );
}

export async function getMyTasks(
  client: OdinSupabaseClient,
  cursor?: string | null,
): Promise<TaskPageDto> {
  return parseTaskPage(
    await callRpc(
      client,
      'get_my_tasks',
      cursor === null || cursor === undefined ? undefined : { p_cursor: cursor },
    ),
  );
}

export async function getUnassigned(
  client: OdinSupabaseClient,
  cursor?: string | null,
): Promise<TaskPageDto> {
  return parseTaskPage(
    await callRpc(
      client,
      'get_unassigned',
      cursor === null || cursor === undefined ? undefined : { p_cursor: cursor },
    ),
  );
}

/**
 * Follows `next_cursor` to the end. Pages are rendered as they arrive in the UI;
 * this helper exists for callers that genuinely need the whole set.
 */
export async function getAllPages<T>(
  first: () => Promise<{ tasks: readonly T[]; next_cursor: string | null }>,
  more: (cursor: string) => Promise<{ tasks: readonly T[]; next_cursor: string | null }>,
  maxPages = 50,
): Promise<T[]> {
  const collected: T[] = [];
  let page = await first();
  collected.push(...page.tasks);
  let guard = 0;
  while (page.next_cursor !== null && guard < maxPages) {
    page = await more(page.next_cursor);
    collected.push(...page.tasks);
    guard += 1;
  }
  return collected;
}

export { callRpc };
