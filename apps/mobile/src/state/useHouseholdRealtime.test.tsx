import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react-native';
import { useState, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import type { ChangeKind, SubscriptionHandlers } from '@odin/data';

import { OdinContext, type OdinContextValue } from './OdinContext.ts';
import { unhealthyPollDelay, useHouseholdRealtime } from './useHouseholdRealtime.ts';

/**
 * Battery-relevant behaviour of the realtime hook: one channel for the life of
 * the household, one reconcile per return, and a poll that backs off while the
 * channel is down.
 */

jest.mock('@odin/data', () => ({
  ...jest.requireActual<object>('@odin/data'),
  subscribeToHousehold: jest.fn(),
}));

const data = jest.requireMock<{ subscribeToHousehold: jest.Mock }>('@odin/data');

const CLIENT = {} as OdinContextValue['client'];
const noop = (): void => undefined;

let handlers: SubscriptionHandlers;
let unsubscribes = 0;
let emitAppState: (status: AppStateStatus) => void = noop;
let queryClient: QueryClient;
let invalidate: jest.SpyInstance;

function Probe({ householdId }: { readonly householdId: string | null }): ReactNode {
  useHouseholdRealtime(householdId);
  return null;
}

function Harness({ online }: { readonly online: boolean }): ReactNode {
  const [realtimeHealthy, setRealtimeHealthy] = useState(true);
  const value: OdinContextValue = {
    client: CLIENT,
    user: null,
    authReady: true,
    locale: 'en',
    setLocale: noop,
    t: (key: string) => key,
    online,
    realtimeHealthy,
    setRealtimeHealthy,
    lastSyncedAt: null,
    markSynced: noop,
    signOut: () => Promise.resolve(),
  };
  return (
    <QueryClientProvider client={queryClient}>
      <OdinContext value={value}>
        <Probe householdId="h1" />
      </OdinContext>
    </QueryClientProvider>
  );
}

/** Each reconcile reads membership first, and nothing else invalidates it here. */
function reconciles(): number {
  return invalidate.mock.calls.filter(([filters]) => {
    const key = (filters as { queryKey?: readonly string[] }).queryKey;
    return key?.[0] === 'household';
  }).length;
}

async function appState(status: AppStateStatus): Promise<void> {
  await act(async () => {
    emitAppState(status);
    await Promise.resolve();
  });
}

async function health(healthy: boolean): Promise<void> {
  await act(async () => {
    handlers.onHealthChange?.(healthy);
    await Promise.resolve();
  });
}

async function elapse(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  unsubscribes = 0;
  data.subscribeToHousehold.mockReset().mockImplementation((_client, _id, next) => {
    handlers = next as SubscriptionHandlers;
    return {
      unsubscribe: () => {
        unsubscribes += 1;
      },
    };
  });
  // The React Native jest mock has no real app state; start in the foreground.
  Object.defineProperty(AppState, 'currentState', {
    configurable: true,
    writable: true,
    value: 'active',
  });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    emitAppState = listener;
    return { remove: noop };
  });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  invalidate = jest.spyOn(queryClient, 'invalidateQueries');
});

const originalCurrentState = Object.getOwnPropertyDescriptor(AppState, 'currentState');

afterEach(() => {
  if (originalCurrentState !== undefined) {
    Object.defineProperty(AppState, 'currentState', originalCurrentState);
  }
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it('keeps one channel across background, foreground and network changes', async () => {
  const view = await render(<Harness online />);

  await appState('background');
  await appState('active');
  await view.rerender(<Harness online={false} />);
  await view.rerender(<Harness online />);

  expect(data.subscribeToHousehold).toHaveBeenCalledTimes(1);
  expect(unsubscribes).toBe(0);
});

it('reconciles after the first join, then once per return to the foreground', async () => {
  await render(<Harness online />);
  // The first reads are already loading at mount.
  expect(reconciles()).toBe(0);

  await health(true);
  expect(reconciles()).toBe(1);

  await appState('background');
  await appState('active');
  expect(reconciles()).toBe(2);
});

it('reconciles when the channel recovers, unless the app is away', async () => {
  await render(<Harness online />);
  await health(true);

  await health(false);
  await health(true);
  expect(reconciles()).toBe(2);

  await appState('background');
  await health(false);
  await health(true);
  expect(reconciles()).toBe(2);

  // The return itself reconciles, once.
  await appState('active');
  expect(reconciles()).toBe(3);
});

it('backs the fallback poll off to once a minute and stops it on recovery', async () => {
  await render(<Harness online />);
  await health(true);
  await health(false);
  const before = reconciles();

  await elapse(4_999);
  expect(reconciles() - before).toBe(0);
  for (const [step, delay] of [5_000, 10_000, 20_000, 40_000, 60_000, 60_000].entries()) {
    await elapse(step === 0 ? 1 : delay);
    expect(reconciles() - before).toBe(step + 1);
  }

  await health(true);
  const recovered = reconciles();
  await elapse(10 * 60_000);
  expect(reconciles()).toBe(recovered);
});

it('does not poll while the app is in the background', async () => {
  await render(<Harness online />);
  await health(true);
  await health(false);
  await appState('background');
  const before = reconciles();

  await elapse(10 * 60_000);

  expect(reconciles()).toBe(before);
});

it('invalidates each affected key once for a batch of changes', async () => {
  await render(<Harness online />);
  invalidate.mockClear();

  await act(async () => {
    handlers.onChange(new Set<ChangeKind>(['task', 'list']));
    await Promise.resolve();
  });

  const keys = invalidate.mock.calls.map(([filters]) =>
    (filters as { queryKey: readonly string[] }).queryKey.join('/'),
  );
  expect(keys.sort()).toEqual(['all-tasks', 'home', 'list', 'my-tasks', 'task', 'unassigned']);
});

it('starts at five seconds and caps at one minute', () => {
  expect([0, 1, 2, 3, 4, 5, 50].map(unhealthyPollDelay)).toEqual([
    5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000,
  ]);
});
