import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { ChangeKind } from '@odin/data';
import type * as OdinData from '@odin/data';

const mockState = {
  online: true,
  foreground: true,
  client: {},
  setRealtimeHealthy: jest.fn(),
  markSynced: jest.fn(),
};
jest.mock('./OdinContext.ts', () => ({
  useOdin: () => ({ ...mockState, realtimeHealthy: true }),
}));
jest.mock('./useAppForeground.ts', () => ({
  useAppForeground: () => mockState.foreground,
}));
jest.mock('@odin/data', () => ({
  ...jest.requireActual<typeof OdinData>('@odin/data'),
  subscribeToHousehold: jest.fn(() => ({ unsubscribe: jest.fn() })),
}));

const realtime = jest.requireMock<{
  subscribeToHousehold: jest.Mock<
    { unsubscribe: jest.Mock },
    [unknown, string, { onChange: (kind: ChangeKind) => void }]
  >;
}>('@odin/data');

import { useHouseholdRealtime } from './useHouseholdRealtime.ts';

it('keeps one subscription across app-state changes and batches task hints', async () => {
  jest.useFakeTimers();
  const queryClient = new QueryClient();
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  const { rerender, unmount } = await renderHook(() => useHouseholdRealtime('home-1'), {
    wrapper: Wrapper,
  });
  await act(async () => {
    await Promise.resolve();
  });
  expect(realtime.subscribeToHousehold).toHaveBeenCalledTimes(1);
  invalidate.mockClear();

  mockState.online = false;
  mockState.foreground = false;
  await rerender(undefined);
  expect(realtime.subscribeToHousehold).toHaveBeenCalledTimes(1);

  const callbacks = realtime.subscribeToHousehold.mock.calls[0]?.[2];
  expect(callbacks).toBeDefined();
  await act(async () => {
    callbacks?.onChange('task');
    callbacks?.onChange('task');
    jest.advanceTimersByTime(100);
    await Promise.resolve();
  });
  const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey?.join(':'));
  expect(keys).toEqual(['home', 'my-tasks', 'unassigned', 'list']);

  await unmount();
  jest.useRealTimers();
});
