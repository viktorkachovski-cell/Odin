import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import type { CommandResult } from '@odin/contracts';
import { useCommand } from '@odin/data';

/**
 * The request ID rule is the subtlest correctness property on the client:
 * an ambiguous NETWORK failure must retry under the SAME id so the server's
 * idempotency receipt collapses the duplicate, while a settled outcome must
 * mint a fresh id so a deliberate second create really creates.
 */

function wrapper({ children }: { readonly children: ReactNode }): ReactNode {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: 0 } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useCommand request ids', () => {
  it('reuses the same request id when a NETWORK failure leaves the outcome unknown', async () => {
    const seen: string[] = [];
    const execute = (requestId: string): Promise<CommandResult<string>> => {
      seen.push(requestId);
      return Promise.resolve({
        ok: false,
        error: { code: 'NETWORK', message_key: 'error.network' },
      });
    };

    const { result } = renderHook(() => useCommand(execute), { wrapper });

    await act(async () => {
      await result.current.run({});
    });
    await act(async () => {
      await result.current.retry();
    });
    await act(async () => {
      await result.current.run({});
    });

    expect(seen).toHaveLength(3);
    expect(new Set(seen).size).toBe(1);
  });

  it('mints a fresh request id after a success, so a second create really creates', async () => {
    const seen: string[] = [];
    const execute = (requestId: string): Promise<CommandResult<string>> => {
      seen.push(requestId);
      return Promise.resolve({ ok: true, data: 'list-1' });
    };

    const { result } = renderHook(() => useCommand(execute), { wrapper });

    await act(async () => {
      await result.current.run({});
    });
    await act(async () => {
      await result.current.run({});
    });

    expect(new Set(seen).size).toBe(2);
  });

  it('mints a fresh request id after a definite failure such as CONFLICT', async () => {
    const seen: string[] = [];
    const execute = (requestId: string): Promise<CommandResult<string>> => {
      seen.push(requestId);
      return Promise.resolve({
        ok: false,
        error: { code: 'CONFLICT', message_key: 'error.conflict', current_version: 4 },
      });
    };

    const { result } = renderHook(() => useCommand(execute), { wrapper });

    await act(async () => {
      await result.current.run({});
    });
    await act(async () => {
      await result.current.run({});
    });

    expect(new Set(seen).size).toBe(2);
  });

  it('surfaces the conflict error with the server current_version', async () => {
    const execute = (): Promise<CommandResult<string>> =>
      Promise.resolve({
        ok: false,
        error: { code: 'CONFLICT', message_key: 'error.conflict', current_version: 7 },
      });

    const { result } = renderHook(() => useCommand(execute), { wrapper });

    await act(async () => {
      await result.current.run({});
    });

    await waitFor(() => {
      expect(result.current.state.error?.current_version).toBe(7);
    });
  });

  it('retry is a no-op before anything has been sent', async () => {
    const execute = (): Promise<CommandResult<string>> => Promise.resolve({ ok: true, data: 'x' });
    const { result } = renderHook(() => useCommand(execute), { wrapper });

    let outcome: CommandResult<string> | null = null;
    await act(async () => {
      outcome = await result.current.retry();
    });
    expect(outcome).toBeNull();
  });
});
