import { commandError, type CommandResult } from '@odin/contracts';

import type { AuthUser } from './auth.ts';
import type { OdinSupabaseClient } from './client.ts';
import { toOdinError } from './error-mapping.ts';

interface AuthFailure {
  readonly code?: string | undefined;
  readonly status?: number | undefined;
}

/** Never expose provider messages, addresses or credentials to UI/logging. */
function authFailure(error: AuthFailure) {
  if (error.status === 429) return commandError('RATE_LIMITED');
  const keys: Readonly<Record<string, string>> = {
    invalid_credentials: 'auth.password.invalid_credentials',
    email_not_confirmed: 'auth.password.unconfirmed',
    weak_password: 'auth.password.weak',
    same_password: 'auth.password.same',
    email_address_invalid: 'auth.password.invalid_email',
    email_address_not_authorized: 'auth.password.email_unavailable',
    otp_expired: 'auth.password.invalid_link',
  };
  const key = keys[error.code ?? ''];
  return key === undefined ? commandError('UNKNOWN') : commandError('VALIDATION', key);
}

async function runAuth<T>(operation: () => Promise<CommandResult<T>>): Promise<CommandResult<T>> {
  try {
    return await operation();
  } catch (cause) {
    return { ok: false, error: toOdinError(cause).info };
  }
}

export function registerWithPassword(
  client: OdinSupabaseClient,
  email: string,
  password: string,
  emailRedirectTo: string,
): Promise<CommandResult<{ readonly confirmationRequired: boolean }>> {
  return runAuth(async () => {
    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo },
    });
    // Duplicate signup remains deliberately indistinguishable from a new signup.
    if (error?.code === 'user_already_exists') {
      return { ok: true, data: { confirmationRequired: true } };
    }
    if (error !== null) return { ok: false, error: authFailure(error) };
    return { ok: true, data: { confirmationRequired: data.session === null } };
  });
}

export function signInWithPassword(
  client: OdinSupabaseClient,
  email: string,
  password: string,
): Promise<CommandResult<AuthUser>> {
  return runAuth(async () => {
    const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (error !== null) return { ok: false, error: authFailure(error) };
    if (data.user === null) return { ok: false, error: commandError('UNKNOWN') };
    return { ok: true, data: { id: data.user.id, email: data.user.email ?? null } };
  });
}

export function requestPasswordReset(
  client: OdinSupabaseClient,
  email: string,
  redirectTo: string,
): Promise<CommandResult<null>> {
  return runAuth(async () => {
    const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo });
    return error === null ? { ok: true, data: null } : { ok: false, error: authFailure(error) };
  });
}

export function resendConfirmation(
  client: OdinSupabaseClient,
  email: string,
  emailRedirectTo: string,
): Promise<CommandResult<null>> {
  return runAuth(async () => {
    const { error } = await client.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo },
    });
    return error === null ? { ok: true, data: null } : { ok: false, error: authFailure(error) };
  });
}

export function updatePassword(
  client: OdinSupabaseClient,
  password: string,
): Promise<CommandResult<null>> {
  return runAuth(async () => {
    const { error } = await client.auth.updateUser({ password });
    return error === null ? { ok: true, data: null } : { ok: false, error: authFailure(error) };
  });
}

/** Only call with tokens captured from an explicitly handled email callback. */
export function restoreEmailSession(
  client: OdinSupabaseClient,
  tokens: { readonly access_token: string; readonly refresh_token: string },
): Promise<CommandResult<AuthUser>> {
  return runAuth(async () => {
    const { data, error } = await client.auth.setSession(tokens);
    if (error !== null || data.user === null) {
      return { ok: false, error: commandError('VALIDATION', 'auth.password.invalid_link') };
    }
    return { ok: true, data: { id: data.user.id, email: data.user.email ?? null } };
  });
}
