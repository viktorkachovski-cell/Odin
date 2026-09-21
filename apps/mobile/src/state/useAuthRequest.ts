import { useCallback, useEffect, useRef, useState } from 'react';

import type { CommandError, CommandResult } from '@odin/contracts';

import { useOdin } from './OdinContext.ts';

/**
 * One in-flight authentication request, with the rules every auth screen needs
 * applied in one place: no double submit, no submit while offline, and a
 * visible cooldown on anything that sends mail.
 *
 * The cooldown is a usability aid on top of the server's own rate limit, never
 * a replacement for it.
 */

export const EMAIL_COOLDOWN_SECONDS = 60;

export interface AuthRequest {
  readonly pending: boolean;
  readonly error: CommandError | null;
  readonly setError: (error: CommandError | null) => void;
  readonly cooldown: number;
  /** True while a request is in flight or the device is offline. */
  readonly disabled: boolean;
  readonly run: <T>(
    operation: () => Promise<CommandResult<T>>,
    sendsEmail?: boolean,
  ) => Promise<CommandResult<T> | null>;
}

export function useAuthRequest(): AuthRequest {
  const { online } = useOdin();
  // A ref, not the pending state: two fast taps both run before React has
  // re-rendered the disabled button, and a second tap must never send a second
  // confirmation email.
  const locked = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<CommandError | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const run = useCallback(
    async <T>(
      operation: () => Promise<CommandResult<T>>,
      sendsEmail = false,
    ): Promise<CommandResult<T> | null> => {
      if (locked.current || !online || (sendsEmail && cooldown > 0)) return null;
      locked.current = true;
      setPending(true);
      setError(null);
      try {
        const result = await operation();
        if (!result.ok) setError(result.error);
        if (sendsEmail) setCooldown(EMAIL_COOLDOWN_SECONDS);
        return result;
      } catch {
        // The data layer already converts failures into a CommandResult, so
        // reaching here means something unforeseen; it still must not surface
        // a provider message.
        const failure: CommandError = { code: 'UNKNOWN', message_key: 'error.unknown' };
        setError(failure);
        if (sendsEmail) setCooldown(EMAIL_COOLDOWN_SECONDS);
        return { ok: false, error: failure };
      } finally {
        locked.current = false;
        setPending(false);
      }
    },
    [online, cooldown],
  );

  return { pending, error, setError, cooldown, disabled: pending || !online, run };
}
