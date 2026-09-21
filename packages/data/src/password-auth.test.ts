import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthApiError } from '@supabase/supabase-js';
import { createOdinClient } from './client.ts';
import {
  registerWithPassword,
  requestPasswordReset,
  resendConfirmation,
  restoreEmailSession,
  signInWithPassword,
  updatePassword,
} from './password-auth.ts';

const client = createOdinClient({
  url: 'https://auth-test.supabase.co',
  publishableKey: 'test-only',
});
const email = 'auth-test@example.invalid';
const password = ' synthetic password ';
const redirect = 'https://odin.example/auth/confirmed';
afterEach(() => vi.restoreAllMocks());

describe('password auth adapter', () => {
  it('requests confirmation at the exact caller-supplied URL, trimming only the email', async () => {
    const signup = vi
      .spyOn(client.auth, 'signUp')
      .mockResolvedValue({ data: { user: null, session: null }, error: null });
    expect(await registerWithPassword(client, ` ${email} `, password, redirect)).toEqual({
      ok: true,
      data: { confirmationRequired: true },
    });
    expect(signup).toHaveBeenCalledWith({
      email,
      password,
      options: { emailRedirectTo: redirect },
    });
  });
  it('does not disclose an existing account', async () => {
    vi.spyOn(client.auth, 'signUp').mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError('sensitive provider text', 422, 'user_already_exists'),
    });
    expect(await registerWithPassword(client, email, password, redirect)).toEqual({
      ok: true,
      data: { confirmationRequired: true },
    });
  });
  it.each([
    ['invalid_credentials', 400, 'auth.password.invalid_credentials'],
    ['email_not_confirmed', 400, 'auth.password.unconfirmed'],
    ['weak_password', 422, 'auth.password.weak'],
    ['over_email_send_rate_limit', 429, 'error.rate_limited'],
  ])('maps %s without exposing provider text', async (code, status, key) => {
    vi.spyOn(client.auth, 'signInWithPassword').mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError('sensitive provider text', status, code),
    });
    const result = await signInWithPassword(client, email, password);
    expect(result).toMatchObject({ ok: false, error: { message_key: key } });
    expect(JSON.stringify(result)).not.toContain('sensitive');
  });
  it('maps network failures and preserves the original password', async () => {
    const signin = vi
      .spyOn(client.auth, 'signInWithPassword')
      .mockRejectedValue(new TypeError('fetch failed'));
    expect(await signInWithPassword(client, ` ${email} `, password)).toMatchObject({
      ok: false,
      error: { code: 'NETWORK' },
    });
    expect(signin).toHaveBeenCalledWith({ email, password });
  });
  it('uses recovery and resend APIs without recreating accounts', async () => {
    const reset = vi
      .spyOn(client.auth, 'resetPasswordForEmail')
      .mockResolvedValue({ data: {}, error: null });
    const resend = vi
      .spyOn(client.auth, 'resend')
      .mockResolvedValue({ data: { user: null, session: null }, error: null });
    await requestPasswordReset(client, email, redirect);
    await resendConfirmation(client, email, redirect);
    expect(reset).toHaveBeenCalledWith(email, { redirectTo: redirect });
    expect(resend).toHaveBeenCalledWith({
      type: 'signup',
      email,
      options: { emailRedirectTo: redirect },
    });
  });
  it('rejects a failed callback instead of reporting a previous session as success', async () => {
    vi.spyOn(client.auth, 'setSession').mockResolvedValue({
      data: { user: null, session: null },
      error: new AuthApiError('expired', 400, 'otp_expired'),
    });
    expect(
      await restoreEmailSession(client, { access_token: 'synthetic', refresh_token: 'synthetic' }),
    ).toMatchObject({ ok: false, error: { message_key: 'auth.password.invalid_link' } });
  });
  it('surfaces same-password rejection', async () => {
    vi.spyOn(client.auth, 'updateUser').mockResolvedValue({
      data: { user: null },
      error: new AuthApiError('same', 422, 'same_password'),
    });
    expect(await updatePassword(client, password)).toMatchObject({
      ok: false,
      error: { message_key: 'auth.password.same' },
    });
  });
});
