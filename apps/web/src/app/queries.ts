import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type {
  HomePageDto,
  HouseholdDto,
  ListPageDto,
  MemberDto,
  ProfileDto,
  TaskPageDto,
  TaskDto,
  AllTaskPageDto,
} from '@odin/contracts';
import type { TaskDeadlineFilter } from '@odin/domain';
import {
  getAllTasksAll,
  getHomeAll,
  getListAll,
  getMembers,
  getMyHousehold,
  getMyProfile,
  getMyTasksAll,
  getUnassignedAll,
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

export function useMembersQuery(enabled: boolean): UseQueryResult<MemberDto[]> {
  const { client } = useOdin();
  return useQuery({
    queryKey: queryKeys.members,
    queryFn: () => getMembers(client),
    enabled,
  });
}

export function useHomeQuery(enabled: boolean): UseQueryResult<HomePageDto> {
  const { client } = useOdin();
  return useQuery({
    queryKey: queryKeys.home,
    queryFn: () => getHomeAll(client),
    enabled,
  });
}

export function useListQuery(
  listId: string | undefined,
  enabled: boolean,
): UseQueryResult<ListPageDto> {
  const { client } = useOdin();
  return useQuery({
    queryKey: queryKeys.list(listId ?? ''),
    queryFn: () => getListAll(client, listId ?? ''),
    enabled: enabled && listId !== undefined && listId.length > 0,
  });
}

export function useMyTasksQuery(enabled: boolean): UseQueryResult<TaskPageDto> {
  const { client } = useOdin();
  return useQuery({
    queryKey: queryKeys.myTasks,
    queryFn: () => getMyTasksAll(client),
    enabled,
  });
}

export function useUnassignedQuery(enabled: boolean): UseQueryResult<TaskPageDto> {
  const { client } = useOdin();
  return useQuery({
    queryKey: queryKeys.unassigned,
    queryFn: () => getUnassignedAll(client),
    enabled,
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

export function useAllTasksQuery(
  filter: TaskDeadlineFilter,
  enabled: boolean,
): UseQueryResult<AllTaskPageDto> {
  const { client } = useOdin();
  return useQuery({
    queryKey: [...queryKeys.allTasks, filter],
    queryFn: () => getAllTasksAll(client, filter),
    enabled,
  });
}
