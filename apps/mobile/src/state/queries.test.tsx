import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useState, type ReactNode } from 'react';

jest.mock('./OdinContext.ts', () => ({ useOdin: () => ({ client: {} }) }));
jest.mock('@odin/data', () => ({
  getHome: jest.fn(),
  getList: jest.fn(),
  getMyTasks: jest.fn(),
  getUnassigned: jest.fn(),
  queryKeys: {
    home: ['home'],
    list: (id: string) => ['list', id],
    myTasks: ['my-tasks'],
    unassigned: ['unassigned'],
  },
}));

type CursorReadMock = jest.Mock<Promise<unknown>, [unknown, string | null]>;
const reads = jest.requireMock<{
  getHome: CursorReadMock;
  getList: jest.Mock<Promise<unknown>, [unknown, string, string | null]>;
  getMyTasks: CursorReadMock;
  getUnassigned: CursorReadMock;
}>('@odin/data');

import { useHomeQuery, useListQuery, useMyTasksQuery, useUnassignedQuery } from './queries.ts';

function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => jest.clearAllMocks());

it('loads a later Home page with the returned cursor', async () => {
  reads.getHome.mockResolvedValueOnce({ items: [{ id: 'first' }], next_cursor: 'home-2' });
  reads.getHome.mockResolvedValueOnce({ items: [{ id: 'second' }], next_cursor: null });
  const { result } = await renderHook(() => useHomeQuery(true), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.hasNextPage).toBe(true));
  await act(async () => {
    await result.current.fetchNextPage();
  });
  expect(reads.getHome.mock.calls.map((call) => call[1])).toEqual([null, 'home-2']);
  await waitFor(() =>
    expect(result.current.data?.pages.flatMap((page) => page.items.map((item) => item.id))).toEqual(
      ['first', 'second'],
    ),
  );
});

it('loads later tasks without changing the list identity', async () => {
  reads.getList.mockResolvedValueOnce({ tasks: [{ id: 'first' }], next_cursor: 'list-2' });
  reads.getList.mockResolvedValueOnce({ tasks: [{ id: 'second' }], next_cursor: null });
  const { result } = await renderHook(() => useListQuery('list-1', true), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.hasNextPage).toBe(true));
  await act(async () => {
    await result.current.fetchNextPage();
  });
  expect(reads.getList.mock.calls.map((call) => call.slice(1))).toEqual([
    ['list-1', null],
    ['list-1', 'list-2'],
  ]);
  await waitFor(() =>
    expect(result.current.data?.pages.flatMap((page) => page.tasks.map((task) => task.id))).toEqual(
      ['first', 'second'],
    ),
  );
});

it('loads later My Tasks and Unassigned pages independently', async () => {
  reads.getMyTasks.mockResolvedValueOnce({ items: [{ task_id: 'mine-1' }], next_cursor: 'mine-2' });
  reads.getMyTasks.mockResolvedValueOnce({ items: [{ task_id: 'mine-2' }], next_cursor: null });
  reads.getUnassigned.mockResolvedValueOnce({
    items: [{ task_id: 'open-1' }],
    next_cursor: 'open-2',
  });
  reads.getUnassigned.mockResolvedValueOnce({ items: [{ task_id: 'open-2' }], next_cursor: null });
  const mine = await renderHook(() => useMyTasksQuery(true), { wrapper: Wrapper });
  const open = await renderHook(() => useUnassignedQuery(true), { wrapper: Wrapper });
  await waitFor(() => expect(mine.result.current.hasNextPage).toBe(true));
  await waitFor(() => expect(open.result.current.hasNextPage).toBe(true));
  await act(async () => {
    await Promise.all([mine.result.current.fetchNextPage(), open.result.current.fetchNextPage()]);
  });
  expect(reads.getMyTasks.mock.calls.map((call) => call[1])).toEqual([null, 'mine-2']);
  expect(reads.getUnassigned.mock.calls.map((call) => call[1])).toEqual([null, 'open-2']);
});
