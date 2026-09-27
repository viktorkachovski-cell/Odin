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
  HomeDto,
  HouseholdDto,
  ListDetailDto,
  MemberDto,
  ProfileDto,
  TaskCollectionDto,
} from '@odin/contracts';
import {
  parseHome,
  parseHousehold,
  parseListDetail,
  parseMembers,
  parseProfile,
  parseTaskCollection,
} from '@odin/contracts';
import { resolveTaskDeadlineFilter, type TaskDeadlineFilter } from '@odin/domain';

import type { OdinSupabaseClient } from './client.ts';
import { mapPostgrestError, OdinError, toOdinError, unwrapEnvelope } from './error-mapping.ts';

export async function readRpc<T>(
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

/*
 * Household collections are read as one snapshot each. Paging them would let
 * a row that another member reorders between two page reads be dropped or
 * repeated; the server refuses a collection too large for one read with
 * TOO_LARGE instead of truncating it.
 */

export function getHome(client: OdinSupabaseClient): Promise<HomeDto> {
  return readRpc(client, 'get_home_v2', parseHome);
}

export function getList(client: OdinSupabaseClient, listId: string): Promise<ListDetailDto> {
  return readRpc(client, 'get_list_v2', parseListDetail, { p_list_id: listId });
}

export function getMyTasks(client: OdinSupabaseClient): Promise<TaskCollectionDto> {
  return readRpc(client, 'get_my_tasks_v2', parseTaskCollection);
}

export function getUnassigned(client: OdinSupabaseClient): Promise<TaskCollectionDto> {
  return readRpc(client, 'get_unassigned_v2', parseTaskCollection);
}

/** Local-day deadline filters resolve against `now`, so one read has one notion of today. */
export async function getAllTasks(
  client: OdinSupabaseClient,
  filter: TaskDeadlineFilter,
  now = new Date(),
): Promise<TaskCollectionDto> {
  const result = resolveTaskDeadlineFilter(filter, now);
  if (!result.ok) throw new OdinError({ code: 'VALIDATION', message_key: 'filter.date.invalid' });
  return readRpc(client, 'get_all_tasks', parseTaskCollection, {
    p_due_from: result.bounds.dueFrom,
    p_due_before: result.bounds.dueBefore,
    p_undated: result.bounds.undated,
    p_incomplete_only: result.bounds.incompleteOnly,
  });
}
