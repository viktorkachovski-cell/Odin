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

export function useMembersQuery(enabled: boolean): UseQueryResult<MemberDto[]> {
  const { client } = useOdin();
  return useQuery({
    queryKey: queryKeys.members,
    queryFn: () => getMembers(client),
    enabled,
  });
}

export function useHomeQuery(enabled: boolean): UseQueryResult<HomeDto> {
  const { client } = useOdin();
  return useQuery({
    queryKey: queryKeys.home,
    queryFn: () => getHome(client),
    enabled,
  });
}

export function useListQuery(
  listId: string | undefined,
  enabled: boolean,
): UseQueryResult<ListDetailDto> {
  const { client } = useOdin();
  return useQuery({
    queryKey: queryKeys.list(listId ?? ''),
    queryFn: () => getList(client, listId ?? ''),
    enabled: enabled && listId !== undefined && listId.length > 0,
  });
}

export function useMyTasksQuery(enabled: boolean): UseQueryResult<TaskCollectionDto> {
  const { client } = useOdin();
  return useQuery({
    queryKey: queryKeys.myTasks,
    queryFn: () => getMyTasks(client),
    enabled,
  });
}

export function useUnassignedQuery(enabled: boolean): UseQueryResult<TaskCollectionDto> {
  const { client } = useOdin();
  return useQuery({
    queryKey: queryKeys.unassigned,
    queryFn: () => getUnassigned(client),
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
): UseQueryResult<TaskCollectionDto> {
  const { client } = useOdin();
  return useQuery({
    queryKey: [...queryKeys.allTasks, filter],
    queryFn: () => getAllTasks(client, filter),
    enabled,
  });
}
