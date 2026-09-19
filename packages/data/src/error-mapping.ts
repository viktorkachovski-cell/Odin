/**
 * Maps every failure mode onto the contract's single typed error model.
 *
 * SQL text never reaches the caller: the result is always a code plus a
 * `message_key` the UI translates. Read RPCs raise on authorization failures,
 * so PostgREST surfaces our own envelope in `details`; command RPCs already
 * return the envelope with HTTP 200.
 */

import type { CommandError, CommandResult } from '@odin/contracts';
import { commandError, isErrorCode } from '@odin/contracts';

/**
 * Structurally matches both PostgrestError and AuthError. Every field is
 * explicitly `| undefined` because `exactOptionalPropertyTypes` distinguishes
 * "absent" from "present and undefined", and the SDK produces the latter.
 */
interface PostgrestLikeError {
  readonly message?: string | undefined;
  readonly details?: string | null | undefined;
  readonly hint?: string | null | undefined;
  readonly code?: string | null | undefined;
}

function fromEnvelopeText(details: string | null | undefined): CommandError | null {
  if (typeof details !== 'string' || details.length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(details);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const envelope = parsed as { error?: unknown };
    if (typeof envelope.error !== 'object' || envelope.error === null) return null;
    const raw = envelope.error as {
      code?: unknown;
      message_key?: unknown;
      current_version?: unknown;
    };
    if (!isErrorCode(raw.code)) return null;
    return commandError(
      raw.code,
      typeof raw.message_key === 'string' ? raw.message_key : undefined,
      typeof raw.current_version === 'number' ? raw.current_version : undefined,
    );
  } catch {
    return null;
  }
}

/** PostgREST / PostgreSQL codes that have an unambiguous contract equivalent. */
function fromTransportCode(code: string | null | undefined): CommandError | null {
  switch (code) {
    case 'PGRST301':
    case '42501':
      return commandError(code === '42501' ? 'FORBIDDEN' : 'UNAUTHENTICATED');
    case 'PGRST116':
      return commandError('NOT_FOUND');
    case '23505':
      return commandError('CONFLICT');
    default:
      return null;
  }
}

export function mapPostgrestError(error: PostgrestLikeError): CommandError {
  return (
    fromEnvelopeText(error.details) ??
    (isErrorCode(error.message) ? commandError(error.message) : null) ??
    fromTransportCode(error.code) ??
    commandError('UNKNOWN')
  );
}

/**
 * A thrown fetch failure means the commit outcome is unknown, so it maps to
 * NETWORK -- the signal that a retry must reuse the same request ID.
 */
export function mapThrownError(cause: unknown): CommandError {
  if (cause instanceof TypeError) return commandError('NETWORK');
  if (
    typeof cause === 'object' &&
    cause !== null &&
    'name' in cause &&
    (cause as { name?: unknown }).name === 'AbortError'
  ) {
    return commandError('NETWORK');
  }
  return commandError('UNKNOWN');
}

/** Narrows an RPC payload that should already be a command envelope. */
export function asCommandResult<T>(
  payload: unknown,
  parse: (data: unknown) => T,
): CommandResult<T> {
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: commandError('UNKNOWN') };
  }
  const envelope = payload as { ok?: unknown; data?: unknown; error?: unknown };

  if (envelope.ok === true) {
    try {
      return { ok: true, data: parse(envelope.data) };
    } catch {
      return { ok: false, error: commandError('UNKNOWN') };
    }
  }

  if (typeof envelope.error === 'object' && envelope.error !== null) {
    const raw = envelope.error as {
      code?: unknown;
      message_key?: unknown;
      current_version?: unknown;
    };
    if (isErrorCode(raw.code)) {
      return {
        ok: false,
        error: commandError(
          raw.code,
          typeof raw.message_key === 'string' ? raw.message_key : undefined,
          typeof raw.current_version === 'number' ? raw.current_version : undefined,
        ),
      };
    }
  }

  return { ok: false, error: commandError('UNKNOWN') };
}

/** Thrown by repositories so TanStack Query treats a failed read as an error. */
export class OdinError extends Error {
  readonly info: CommandError;

  constructor(info: CommandError) {
    super(info.code);
    this.name = 'OdinError';
    this.info = info;
  }
}

export function toOdinError(cause: unknown): OdinError {
  if (cause instanceof OdinError) return cause;
  return new OdinError(mapThrownError(cause));
}
