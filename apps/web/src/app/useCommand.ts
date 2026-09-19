import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

import type { CommandError, CommandResult } from '@odin/contracts';
import { newRequestId } from '@odin/data';

/**
 * Runs a command while holding one request ID for the whole attempt, including
 * an ambiguous NETWORK retry. A fresh ID is minted only after a settled
 * outcome, so a timed-out create can never silently become two creates.
 *
 * Conflicts are never retried automatically: the user reviews and resubmits,
 * which mints a new ID against a fresh version.
 */

export interface CommandState {
  readonly pending: boolean;
  readonly error: CommandError | null;
}

export interface UseCommandResult<TInput, TData> {
  readonly run: (input: TInput) => Promise<CommandResult<TData>>;
  /** Re-sends the last input under the SAME request ID after a NETWORK error. */
  readonly retry: () => Promise<CommandResult<TData> | null>;
  readonly state: CommandState;
  readonly reset: () => void;
}

export function useCommand<TInput, TData>(
  execute: (requestId: string, input: TInput) => Promise<CommandResult<TData>>,
  options: {
    readonly invalidate?: readonly (readonly string[])[];
    readonly onSuccess?: (data: TData) => void;
  } = {},
): UseCommandResult<TInput, TData> {
  const queryClient = useQueryClient();
  const [state, setState] = useState<CommandState>({ pending: false, error: null });

  const requestIdRef = useRef<string | null>(null);
  const lastInputRef = useRef<TInput | null>(null);
  const { invalidate, onSuccess } = options;

  const invalidateAffected = useCallback(async () => {
    if (invalidate === undefined) return;
    await Promise.all(invalidate.map((key) => queryClient.invalidateQueries({ queryKey: key })));
  }, [invalidate, queryClient]);

  const dispatch = useCallback(
    async (input: TInput, requestId: string): Promise<CommandResult<TData>> => {
      setState({ pending: true, error: null });
      const result = await execute(requestId, input);

      if (result.ok) {
        // Settled: the next submission is a genuinely new operation.
        requestIdRef.current = null;
        lastInputRef.current = null;
        setState({ pending: false, error: null });
        await invalidateAffected();
        onSuccess?.(result.data);
        return result;
      }

      // NETWORK leaves the outcome unknown, so the ID is deliberately kept.
      if (result.error.code !== 'NETWORK') {
        requestIdRef.current = null;
      }
      setState({ pending: false, error: result.error });
      return result;
    },
    [execute, invalidateAffected, onSuccess],
  );

  const run = useCallback(
    (input: TInput) => {
      const requestId = requestIdRef.current ?? newRequestId();
      requestIdRef.current = requestId;
      lastInputRef.current = input;
      return dispatch(input, requestId);
    },
    [dispatch],
  );

  const retry = useCallback(() => {
    const requestId = requestIdRef.current;
    const input = lastInputRef.current;
    if (requestId === null || input === null) return Promise.resolve(null);
    return dispatch(input, requestId);
  }, [dispatch]);

  const reset = useCallback(() => {
    requestIdRef.current = null;
    lastInputRef.current = null;
    setState({ pending: false, error: null });
  }, []);

  return { run, retry, state, reset };
}
