import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type {
  HomeDto,
  HouseholdDto,
  ListDetailDto,
  MemberDto,
  ProfileDto,
  TaskCollectionDto,
  TaskDto,
} from '@odin/contracts';
import {
  getAllTasks,
  getHome,
  getList,
  getMembers,
  getMyHousehold,
  getMyProfile,
  getTask,
  queryKeys,
} from '@odin/data';

import { useOdin } from './OdinContext.ts';

/**
 * Read hooks. They only wrap the pure repositories, which stay testable without
 * rendering. Household scope comes from the server session, never from a
 * client-supplied id.
 */

export function useProfileQuery(): UseQueryResult<ProfileDto | null> {
  const { client, user } = useOdin();
  return useQuery({
    queryKey: queryKeys.profile,
    queryFn: () => getMyProfile(client, user?.id ?? ''),
    enabled: user !== null,
  });
}

export function useHouseholdQuery(): UseQueryResult<HouseholdDto | null> {
  const { client, user } = useOdin();
  return useQuery({
    queryKey: queryKeys.household,
    queryFn: () => getMyHousehold(client),
    enabled: user !== null,
  });
}

export function useMembersQuery(): UseQueryResult<MemberDto[]> {
  const { client } = useOdin();
  return useQuery({ queryKey: queryKeys.members, queryFn: () => getMembers(client) });
}

export function useHomeQuery(): UseQueryResult<HomeDto> {
  const { client } = useOdin();
  return useQuery({ queryKey: queryKeys.home, queryFn: () => getHome(client) });
}

export function useListQuery(listId: string | undefined): UseQueryResult<ListDetailDto> {
  const { client } = useOdin();
  return useQuery({
    queryKey: queryKeys.list(listId ?? ''),
    queryFn: () => getList(client, listId ?? ''),
    enabled: listId !== undefined && listId.length > 0,
  });
}

export function useTaskQuery(taskId: string | null): UseQueryResult<TaskDto> {
  const { client } = useOdin();
  return useQuery({
    queryKey: queryKeys.task(taskId ?? ''),
    queryFn: () => getTask(client, taskId ?? ''),
    enabled: taskId !== null,
  });
}

const EVERY_TASK = { preset: 'all' } as const;

/**
 * Every task in the household's open active lists, done ones included, in one
 * read. Today, Tasks and the navigation badge all derive from this cache entry,
 * the same one Android uses, so they always agree and share one refetch.
 */
export function useHouseholdTasksQuery(): UseQueryResult<TaskCollectionDto> {
  const { client } = useOdin();
  return useQuery({
    queryKey: [...queryKeys.allTasks, EVERY_TASK],
    queryFn: () => getAllTasks(client, EVERY_TASK),
  });
}
