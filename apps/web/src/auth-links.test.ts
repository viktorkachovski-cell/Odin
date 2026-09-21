import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOdinClient, restoreEmailSession } from '@odin/data';
import type * as Data from '@odin/data';
import {
  captureEmailLink,
  completeEmailLink,
  isRecoveryUser,
  setRecoveryUser,
} from './auth-links.ts';
import { safeAuthDestination } from './routing.ts';
import {
  clearPendingInvitation,
  getPendingInvitation,
  rememberInvitation,
} from './pending-invitation.ts';
vi.mock('@odin/data', async (original) => ({
  ...(await original<typeof Data>()),
  restoreEmailSession: vi.fn(),
}));
const client = createOdinClient({
  url: 'https://auth-test.supabase.co',
  publishableKey: 'test-only',
});
beforeEach(() => {
  vi.clearAllMocks();
  setRecoveryUser(null);
  clearPendingInvitation();
  window.history.replaceState(null, '', '/');
});

describe('email link handling', () => {
  it('strips bearer tokens before session restoration and routes recovery to its form', async () => {
    window.history.replaceState(
      null,
      '',
      '/#access_token=synthetic&refresh_token=synthetic&type=recovery',
    );
    const link = captureEmailLink(window.location, window.history);
    expect(window.location.hash).toBe('');
    vi.mocked(restoreEmailSession).mockResolvedValue({ ok: true, data: { id: 'u1', email: null } });
    await completeEmailLink(client, link, window.history);
    expect(window.location.pathname).toBe('/reset-password');
    expect(isRecoveryUser('u1')).toBe(true);
    expect(isRecoveryUser('u2')).toBe(false);
    expect(window.sessionStorage.getItem('odin.password-recovery')).not.toContain('synthetic');
  });
  it.each([
    '/reset-password#access_token=synthetic&type=recovery',
    '/auth/confirmed#error=access_denied&error_description=sensitive',
    '/auth/confirmed?error=access_denied&error_description=sensitive',
  ])('rejects malformed/expired link %s and clears recovery state', async (url) => {
    setRecoveryUser('u1');
    window.history.replaceState(null, '', url);
    const link = captureEmailLink(window.location, window.history);
    expect(window.location.href).not.toContain('sensitive');
    await completeEmailLink(client, link, window.history);
    expect(window.location.pathname + window.location.search).toBe('/sign-in?authError=invalid');
    expect(restoreEmailSession).not.toHaveBeenCalled();
    expect(isRecoveryUser('u1')).toBe(false);
  });
  it('does not consume invitation fragments', () => {
    window.history.replaceState(null, '', '/invite#token=synthetic');
    expect(captureEmailLink(window.location, window.history)).toEqual({ kind: 'none' });
    expect(window.location.hash).toBe('#token=synthetic');
  });
  it('rejects failed session restoration', async () => {
    vi.mocked(restoreEmailSession).mockResolvedValue({
      ok: false,
      error: { code: 'VALIDATION', message_key: 'auth.password.invalid_link' },
    });
    await completeEmailLink(
      client,
      { kind: 'session', access_token: 'synthetic', refresh_token: 'synthetic', recovery: true },
      window.history,
    );
    expect(window.location.search).toBe('?authError=invalid');
    expect(isRecoveryUser('u1')).toBe(false);
  });
  it('keeps invitation state across route unmounts until explicitly cleared', () => {
    rememberInvitation('synthetic');
    window.history.replaceState(null, '', '/sign-in');
    expect(getPendingInvitation()).toBe('synthetic');
    clearPendingInvitation();
    expect(getPendingInvitation()).toBeNull();
  });
  it('prevents external and authentication-loop destinations', () => {
    expect(safeAuthDestination('//evil.example')).toBe('/');
    expect(safeAuthDestination('/sign-in?next=/sign-in')).toBe('/');
    expect(safeAuthDestination('/reset-password')).toBe('/');
    expect(safeAuthDestination('/SIGN-IN/')).toBe('/');
    expect(safeAuthDestination('/%73ign-in')).toBe('/');
    expect(safeAuthDestination('/%broken')).toBe('/');
    expect(safeAuthDestination('/invite')).toBe('/invite');
  });
});
