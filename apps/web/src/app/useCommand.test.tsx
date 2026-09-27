import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { CommandResult, TaskRowModel } from '@odin/contracts';
import { useCommand, useTaskRowActions, type OdinSupabaseClient } from '@odin/data';

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

describe('useCommand pending state', () => {
  it('stays pending until the affected reads have refetched', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const shared = ({ children }: { readonly children: ReactNode }): ReactNode => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    let reads = 0;
    let release = (): void => undefined;
    const queryFn = (): Promise<number> => {
      reads += 1;
      const read = reads;
      return read === 1
        ? Promise.resolve(read)
        : new Promise((resolve) => {
            release = () => resolve(read);
          });
    };
    const execute = (): Promise<CommandResult<string>> =>
      Promise.resolve({ ok: true, data: 'moved' });

    const { result } = renderHook(
      () => ({
        read: useQuery({ queryKey: ['home'], queryFn }),
        command: useCommand(execute, { invalidate: [['home']] }),
      }),
      { wrapper: shared },
    );
    await waitFor(() => expect(result.current.read.data).toBe(1));

    let running: Promise<unknown> = Promise.resolve();
    act(() => {
      running = result.current.command.run({});
    });
    await waitFor(() => expect(reads).toBe(2));
    // The write has settled, but the screen still shows the old version.
    expect(result.current.command.state.pending).toBe(true);

    await act(async () => {
      release();
      await running;
    });
    expect(result.current.command.state.pending).toBe(false);
    expect(result.current.read.data).toBe(2);
  });
});

describe('useTaskRowActions', () => {
  const row: TaskRowModel = {
    id: 'task-1',
    title: 'Water the plants',
    completed: false,
    assignee_id: null,
    due_at: null,
    version: 4,
    list_id: 'list-1',
  };

  it('sends the chosen state with the row version and offers retry only for NETWORK', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: { ok: false, error: { code: 'CONFLICT', message_key: 'error.conflict' } },
        error: null,
      })
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const client = { rpc } as unknown as OdinSupabaseClient;
    const { result } = renderHook(() => useTaskRowActions(client, 'list-1'), { wrapper });

    act(() => result.current.setState(row, 'blocked'));
    await waitFor(() => expect(result.current.errors[1]?.error?.code).toBe('CONFLICT'));
    expect(rpc).toHaveBeenCalledWith(
      'set_task_state',
      expect.objectContaining({ task_id: 'task-1', expected_version: 4, state: 'blocked' }),
    );
    expect(result.current.errors[1]?.retry).toBeUndefined();

    act(() => result.current.move(row, 'up'));
    await waitFor(() => expect(result.current.errors[2]?.error?.code).toBe('NETWORK'));
    expect(result.current.errors[2]?.retry).toBeInstanceOf(Function);
    expect(result.current.busy).toBe(false);
  });
});
