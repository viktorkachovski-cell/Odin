import { describe, expect, it } from 'vitest';

import { asCommandResult, mapPostgrestError, mapThrownError } from './error-mapping.ts';
import { keysAffectedByTaskChange, queryKeys } from './query-keys.ts';

describe('mapPostgrestError', () => {
  it('prefers our own envelope carried in the error details', () => {
    const mapped = mapPostgrestError({
      message: 'CONFLICT',
      details: JSON.stringify({
        ok: false,
        error: { code: 'CONFLICT', message_key: 'error.conflict', current_version: 7 },
      }),
    });
    expect(mapped).toEqual({
      code: 'CONFLICT',
      message_key: 'error.conflict',
      current_version: 7,
    });
  });

  it('falls back to the raised code when details are absent', () => {
    expect(mapPostgrestError({ message: 'FORBIDDEN' }).code).toBe('FORBIDDEN');
  });

  it('maps transport codes that have an unambiguous equivalent', () => {
    expect(mapPostgrestError({ message: 'JWT expired', code: 'PGRST301' }).code).toBe(
      'UNAUTHENTICATED',
    );
    expect(mapPostgrestError({ message: 'denied', code: '42501' }).code).toBe('FORBIDDEN');
  });

  it('never leaks SQL text into the user-facing message key', () => {
    const mapped = mapPostgrestError({
      message: 'relation "private.invitations" does not exist',
      details: 'syntax error at or near SELECT',
      code: '42P01',
    });
    expect(mapped.code).toBe('UNKNOWN');
    expect(mapped.message_key).toBe('error.unknown');
    expect(JSON.stringify(mapped)).not.toContain('SELECT');
    expect(JSON.stringify(mapped)).not.toContain('private.invitations');
  });

  it('ignores a malformed details payload instead of throwing', () => {
    expect(mapPostgrestError({ message: 'boom', details: '{not json' }).code).toBe('UNKNOWN');
  });
});

describe('mapThrownError', () => {
  it('treats a fetch failure as NETWORK so the retry reuses the request id', () => {
    expect(mapThrownError(new TypeError('Failed to fetch')).code).toBe('NETWORK');
  });

  it('treats an aborted request as NETWORK', () => {
    const aborted = new Error('aborted');
    aborted.name = 'AbortError';
    expect(mapThrownError(aborted).code).toBe('NETWORK');
  });

  it('falls back to UNKNOWN for anything else', () => {
    expect(mapThrownError(new Error('odd')).code).toBe('UNKNOWN');
  });
});

describe('asCommandResult', () => {
  const identity = (data: unknown): unknown => data;

  it('unwraps a success envelope', () => {
    expect(asCommandResult({ ok: true, data: { id: 'x' } }, identity)).toEqual({
      ok: true,
      data: { id: 'x' },
    });
  });

  it('unwraps a failure envelope and keeps current_version', () => {
    const result = asCommandResult(
      {
        ok: false,
        error: {
          code: 'ALREADY_ASSIGNED',
          message_key: 'error.already_assigned',
          current_version: 2,
        },
      },
      identity,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.current_version).toBe(2);
  });

  it('reports UNKNOWN when the payload parses into an unexpected shape', () => {
    const result = asCommandResult({ ok: true, data: {} }, () => {
      throw new Error('bad shape');
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('UNKNOWN');
  });

  it('rejects an unrecognised error code rather than trusting it', () => {
    const result = asCommandResult({ ok: false, error: { code: 'MADE_UP' } }, identity);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('UNKNOWN');
  });
});

describe('query keys', () => {
  it('invalidates every view a task change can move a task between', () => {
    const keys = keysAffectedByTaskChange('list-1');
    expect(keys).toContainEqual(queryKeys.home);
    expect(keys).toContainEqual(queryKeys.myTasks);
    expect(keys).toContainEqual(queryKeys.unassigned);
    expect(keys).toContainEqual(queryKeys.list('list-1'));
  });

  it('omits the list key when the list is unknown', () => {
    expect(keysAffectedByTaskChange()).toHaveLength(3);
  });
});
