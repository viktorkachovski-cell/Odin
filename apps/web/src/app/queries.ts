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
import type { TaskDeadlineFilter } from '@odin/domain';
import {
  getAllTasks,
  getHome,
  getList,
  getMembers,
  getMyHousehold,
  getMyProfile,
  getMyTasks,
  getTask,
  getUnassigned,
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

export function useMyTasksQuery(): UseQueryResult<TaskCollectionDto> {
  const { client } = useOdin();
  return useQuery({ queryKey: queryKeys.myTasks, queryFn: () => getMyTasks(client) });
}

export function useUnassignedQuery(): UseQueryResult<TaskCollectionDto> {
  const { client } = useOdin();
  return useQuery({ queryKey: queryKeys.unassigned, queryFn: () => getUnassigned(client) });
}

export function useTaskQuery(taskId: string | null): UseQueryResult<TaskDto> {
  const { client } = useOdin();
  return useQuery({
    queryKey: queryKeys.task(taskId ?? ''),
    queryFn: () => getTask(client, taskId ?? ''),
    enabled: taskId !== null,
  });
}

export function useAllTasksQuery(
  filter: TaskDeadlineFilter,
  enabled: boolean,
): UseQueryResult<TaskCollectionDto> {
  const { client } = useOdin();
  return useQuery({
    queryKey: [...queryKeys.allTasks, filter],
    queryFn: () => getAllTasks(client, filter),
    enabled,
  });
}
