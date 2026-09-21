import { QueryClient } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import type { AuthUser } from '@odin/data';

/**
 * Identity handling. A household's cached data must never be visible to a
 * different account, not even for one frame, and a slow session lookup must not
 * resurrect an identity a newer auth event already replaced.
 */

jest.mock('@odin/data', () => ({
  getCurrentUser: jest.fn(),
  onAuthStateChange: jest.fn(),
  signOut: jest.fn(),
}));

const data = jest.requireMock<{
  getCurrentUser: jest.Mock;
  onAuthStateChange: jest.Mock;
  signOut: jest.Mock;
}>('@odin/data');

import { useOdin } from './OdinContext.ts';
import { OdinProvider } from './OdinProvider.tsx';
import {
  clearPendingInvitation,
  getPendingInvitation,
  rememberInvitation,
} from './pending-invitation.ts';

type AuthListener = (user: AuthUser | null) => void;

/** Dispatches an event and lets the resulting state updates settle. */
async function flush(action: () => void): Promise<void> {
  await act(async () => {
    action();
    await Promise.resolve();
  });
}

function Probe(): ReactNode {
  const { user, authReady } = useOdin();
  return <Text>{`${authReady ? 'ready' : 'pending'}:${user?.id ?? 'none'}`}</Text>;
}

let emit: AuthListener = () => undefined;
let active: QueryClient | null = null;

function setUp(initial: Promise<AuthUser | null>): QueryClient {
  data.onAuthStateChange.mockImplementation((_client: unknown, listener: AuthListener) => {
    emit = listener;
    return () => undefined;
  });
  data.getCurrentUser.mockReturnValue(initial);
  active = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return active;
}

async function renderProvider(queryClient: QueryClient): Promise<void> {
  await render(
    <OdinProvider client={{} as never} queryClient={queryClient}>
      <Probe />
    </OdinProvider>,
  );
}

// Cached queries hold garbage-collection timers, which keep the worker alive
// after the assertions are done.
afterEach(() => {
  active?.clear();
  active = null;
});

beforeEach(() => {
  clearPendingInvitation();
  data.getCurrentUser.mockReset();
  data.onAuthStateChange.mockReset();
  data.signOut.mockReset();
});

it('drops the previous account’s cached data when the identity changes', async () => {
  const queryClient = setUp(Promise.resolve({ id: 'u1', email: null }));
  await renderProvider(queryClient);
  expect(screen.getByText('ready:u1')).toBeTruthy();

  queryClient.setQueryData(['home'], 'household of u1');

  await flush(() => emit({ id: 'u2', email: null }));

  expect(queryClient.getQueryData(['home'])).toBeUndefined();
  expect(screen.getByText('ready:u2')).toBeTruthy();
});

it('keeps the cache when the same account is re-announced', async () => {
  const queryClient = setUp(Promise.resolve({ id: 'u1', email: null }));
  await renderProvider(queryClient);

  queryClient.setQueryData(['home'], 'household of u1');

  // A token refresh re-announces the same user; re-fetching everything then
  // would be churn, not safety.
  await flush(() => emit({ id: 'u1', email: null }));

  expect(queryClient.getQueryData(['home'])).toBe('household of u1');
});

it('clears the cache on sign-out', async () => {
  const queryClient = setUp(Promise.resolve({ id: 'u1', email: null }));
  await renderProvider(queryClient);

  queryClient.setQueryData(['home'], 'household of u1');

  await flush(() => emit(null));

  expect(queryClient.getQueryData(['home'])).toBeUndefined();
  expect(screen.getByText('ready:none')).toBeTruthy();
});

it('does not let a slow session lookup resurrect a replaced identity', async () => {
  let settle: ((user: AuthUser | null) => void) | null = null;
  const queryClient = setUp(
    new Promise<AuthUser | null>((resolve) => {
      settle = resolve;
    }),
  );
  await renderProvider(queryClient);

  // Signed out while the restore was still in flight.
  await flush(() => emit(null));
  expect(screen.getByText('ready:none')).toBeTruthy();

  await flush(() => settle?.({ id: 'u1', email: null }));

  expect(screen.getByText('ready:none')).toBeTruthy();
});

describe('a pending invitation', () => {
  it('survives signing in, which is the whole point of holding it', async () => {
    const queryClient = setUp(Promise.resolve(null));
    await renderProvider(queryClient);

    rememberInvitation('invitation-token');
    await flush(() => emit({ id: 'u1', email: null }));

    expect(getPendingInvitation()).toBe('invitation-token');
  });

  it('is discarded when the account changes or signs out', async () => {
    const queryClient = setUp(Promise.resolve({ id: 'u1', email: null }));
    await renderProvider(queryClient);

    rememberInvitation('invitation-token');
    await flush(() => emit(null));

    expect(getPendingInvitation()).toBeNull();
  });
});
