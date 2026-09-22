/**
 * Command response envelope and error model from docs/contract.md.
 * Both clients and the server agree on these codes; the data layer maps
 * transport and auth failures into the same shape.
 */

export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION',
  'CONFLICT',
  'ALREADY_ASSIGNED',
  'IDEMPOTENCY_MISMATCH',
  'INVITE_EXPIRED',
  'INVITE_USED',
  'INVITE_REVOKED',
  'ALREADY_IN_HOUSEHOLD',
  'RATE_LIMITED',
  'NETWORK',
  'UNKNOWN',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface CommandError {
  readonly code: ErrorCode;
  readonly message_key: string;
  /** Present on CONFLICT and ALREADY_ASSIGNED so the editor can offer a review. */
  readonly current_version?: number;
}

export type CommandResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: CommandError };

const CODE_SET: ReadonlySet<string> = new Set(ERROR_CODES);

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && CODE_SET.has(value);
}

/**
 * NETWORK means the commit outcome is unknown: the caller must retry with the
 * SAME request ID rather than generating a fresh one.
 */
export function isOutcomeUnknown(error: CommandError): boolean {
  return error.code === 'NETWORK';
}

/** Conflicts are never retried automatically; the user reviews and resubmits. */
export function isRetryableWithSameRequestId(error: CommandError): boolean {
  return error.code === 'NETWORK';
}

export function commandError(
  code: ErrorCode,
  messageKey?: string,
  currentVersion?: number,
): CommandError {
  return {
    code,
    message_key: messageKey ?? `error.${code.toLowerCase()}`,
    ...(currentVersion === undefined ? {} : { current_version: currentVersion }),
  };
}

export function failure<T>(error: CommandError): CommandResult<T> {
  return { ok: false, error };
}

export function success<T>(data: T): CommandResult<T> {
  return { ok: true, data };
}
