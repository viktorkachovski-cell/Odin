import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { CommandResult } from '@odin/contracts';
import { createTranslator } from '@odin/i18n';

import { OdinContext, type OdinContextValue } from './OdinContext.ts';
import { EMAIL_COOLDOWN_SECONDS, useAuthRequest } from './useAuthRequest.ts';

/**
 * The guards every auth screen depends on, tested without a screen so the
 * synchronous double-submit path is exercised directly rather than through an
 * event helper that already batches.
 */

function wrapper(online: boolean) {
  const value: OdinContextValue = {
    client: {} as OdinContextValue['client'],
    user: null,
    authReady: true,
    locale: 'en',
    setLocale: jest.fn(),
    t: createTranslator('en'),
    online,
    realtimeHealthy: true,
    setRealtimeHealthy: jest.fn(),
    lastSyncedAt: null,
    markSynced: jest.fn(),
    signOut: jest.fn(),
  };
  return function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
    return <OdinContext value={value}>{children}</OdinContext>;
  };
}

function never(): Promise<CommandResult<null>> {
  return new Promise<CommandResult<null>>(() => undefined);
}

it('runs only the first of two calls made in the same tick', async () => {
  const { result } = await renderHook(() => useAuthRequest(), { wrapper: wrapper(true) });

  let started = 0;
  const operation = (): Promise<CommandResult<null>> => {
    started += 1;
    return never();
  };

  await act(async () => {
    void result.current.run(operation);
    void result.current.run(operation);
    await Promise.resolve();
  });

  // Neither call has re-rendered the caller yet; the ref is what stops the
  // second one from sending a duplicate request or a duplicate email.
  expect(started).toBe(1);
});

it('refuses to run at all while offline', async () => {
  const { result } = await renderHook(() => useAuthRequest(), { wrapper: wrapper(false) });

  const operation = jest.fn(never);
  let outcome: CommandResult<null> | null | undefined;
  await act(async () => {
    outcome = await result.current.run(operation);
  });

  expect(operation).not.toHaveBeenCalled();
  expect(outcome).toBeNull();
  expect(result.current.disabled).toBe(true);
});

it('holds off a second mail-sending call for the cooldown', async () => {
  const { result } = await renderHook(() => useAuthRequest(), { wrapper: wrapper(true) });

  const operation = jest.fn(
    (): Promise<CommandResult<null>> => Promise.resolve({ ok: true, data: null }),
  );

  await act(async () => {
    await result.current.run(operation, true);
  });
  expect(result.current.cooldown).toBe(EMAIL_COOLDOWN_SECONDS);

  await act(async () => {
    await result.current.run(operation, true);
  });
  expect(operation).toHaveBeenCalledTimes(1);
});

it('lets a non-mailing call through during that cooldown', async () => {
  const { result } = await renderHook(() => useAuthRequest(), { wrapper: wrapper(true) });

  const send = jest.fn(
    (): Promise<CommandResult<null>> => Promise.resolve({ ok: true, data: null }),
  );
  await act(async () => {
    await result.current.run(send, true);
  });

  // A resend cooldown must not lock the person out of signing in.
  const signIn = jest.fn(
    (): Promise<CommandResult<null>> => Promise.resolve({ ok: true, data: null }),
  );
  await act(async () => {
    await result.current.run(signIn);
  });

  expect(signIn).toHaveBeenCalledTimes(1);
});
