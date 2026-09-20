/**
 * Read side. Pure functions over a client so they stay testable without
 * rendering; the React hooks in the web app wrap them.
 *
 * Household scope is never passed in from the caller: the server derives it from
 * the authenticated session and its active membership.
 *
 * The read RPCs return the same `{ok,...}` envelope as the commands, so a
 * failure is unwrapped into a typed OdinError rather than a raw payload.
 */

import type {
  HomePageDto,
  HouseholdDto,
  ListPageDto,
  MemberDto,
  ProfileDto,
  TaskPageDto,
} from '@odin/contracts';
import {
  parseHomePage,
  parseHousehold,
  parseListPage,
  parseMembers,
  parseProfile,
  parseTaskPage,
} from '@odin/contracts';

import type { OdinSupabaseClient } from './client.ts';
import { mapPostgrestError, OdinError, toOdinError, unwrapEnvelope } from './error-mapping.ts';

async function readRpc<T>(
  client: OdinSupabaseClient,
  fn: string,
  parse: (data: unknown) => T,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    const response = await (
      client.rpc as unknown as (
        name: string,
        params?: Record<string, unknown>,
      ) => PromiseLike<{ data: unknown; error: unknown }>
    )(fn, args);

    if (response.error !== null && response.error !== undefined) {
      throw new OdinError(mapPostgrestError(response.error));
    }
    return unwrapEnvelope(response.data, parse);
  } catch (cause) {
    throw toOdinError(cause);
  }
}

export async function getSession(client: OdinSupabaseClient): Promise<string | null> {
  const { data, error } = await client.auth.getSession();
  if (error !== null) throw new OdinError(mapPostgrestError(error));
  return data.session?.user.id ?? null;
}

/**
 * Own profile, read directly under RLS (`profiles_select_self`). Onboarding
 * needs to know whether a profile exists yet, which `get_my_household` does not
 * report.
 */
export async function getMyProfile(
  client: OdinSupabaseClient,
  userId: string,
): Promise<ProfileDto | null> {
  const { data, error } = await client
    .from('profiles')
    .select('user_id, display_name, avatar_ref, locale')
    .eq('user_id', userId)
    .maybeSingle();

  if (error !== null) throw new OdinError(mapPostgrestError(error));
  return data === null ? null : parseProfile(data);
}

/** Returns null when the account has no active household yet. */
export async function getMyHousehold(client: OdinSupabaseClient): Promise<HouseholdDto | null> {
  try {
    return await readRpc(client, 'get_my_household', parseHousehold);
  } catch (cause) {
    const error = toOdinError(cause);
    // "No household yet" is an expected onboarding state, not a failure.
    if (error.info.code === 'NOT_FOUND') return null;
    throw error;
  }
}

export async function getMembers(client: OdinSupabaseClient): Promise<MemberDto[]> {
  return readRpc(client, 'get_members', parseMembers);
}

export async function getHome(
  client: OdinSupabaseClient,
  cursor?: string | null,
): Promise<HomePageDto> {
  return readRpc(
    client,
    'get_home',
    parseHomePage,
    cursor === null || cursor === undefined ? undefined : { p_cursor: cursor },
  );
}

export async function getList(
  client: OdinSupabaseClient,
  listId: string,
  cursor?: string | null,
): Promise<ListPageDto> {
  return readRpc(client, 'get_list', parseListPage, {
    p_list_id: listId,
    ...(cursor === null || cursor === undefined ? {} : { p_cursor: cursor }),
  });
}

export async function getMyTasks(
  client: OdinSupabaseClient,
  cursor?: string | null,
): Promise<TaskPageDto> {
  return readRpc(
    client,
    'get_my_tasks',
    parseTaskPage,
    cursor === null || cursor === undefined ? undefined : { p_cursor: cursor },
  );
}

export async function getUnassigned(
  client: OdinSupabaseClient,
  cursor?: string | null,
): Promise<TaskPageDto> {
  return readRpc(
    client,
    'get_unassigned',
    parseTaskPage,
    cursor === null || cursor === undefined ? undefined : { p_cursor: cursor },
  );
}
