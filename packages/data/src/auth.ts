/**
 * Email one-time-code sign-in through the supported Supabase Auth APIs. No
 * custom password or OTP storage, and the code and address are never logged.
 */

import type { CommandResult } from '@odin/contracts';
import { commandError } from '@odin/contracts';

import type { OdinSupabaseClient } from './client.ts';
import { mapPostgrestError, OdinError, toOdinError } from './error-mapping.ts';

export interface AuthUser {
  readonly id: string;
  readonly email: string | null;
}

export async function requestSignInCode(
  client: OdinSupabaseClient,
  email: string,
): Promise<CommandResult<null>> {
  try {
    const { error } = await client.auth.signInWithOtp({
      email,
      // Sign-up on first code keeps onboarding to a single flow.
      options: { shouldCreateUser: true },
    });
    if (error !== null) {
      return { ok: false, error: mapAuthError(error.status, error.message) };
    }
    return { ok: true, data: null };
  } catch (cause) {
    return { ok: false, error: toOdinError(cause).info };
  }
}

export async function verifySignInCode(
  client: OdinSupabaseClient,
  email: string,
  code: string,
): Promise<CommandResult<AuthUser>> {
  try {
    const { data, error } = await client.auth.verifyOtp({
      email,
      token: code,
      type: 'email',
    });
    if (error !== null) {
      return { ok: false, error: mapAuthError(error.status, error.message) };
    }
    const user = data.user;
    if (user === null) return { ok: false, error: commandError('UNKNOWN') };
    return { ok: true, data: { id: user.id, email: user.email ?? null } };
  } catch (cause) {
    return { ok: false, error: toOdinError(cause).info };
  }
}

export async function signOut(client: OdinSupabaseClient): Promise<void> {
  await client.auth.signOut();
}

/** Native lifecycle adapter; browsers continue to use SDK visibility handling. */
export async function setSessionAutoRefresh(
  client: OdinSupabaseClient,
  active: boolean,
): Promise<void> {
  if (active) await client.auth.startAutoRefresh();
  else await client.auth.stopAutoRefresh();
}

export async function getCurrentUser(client: OdinSupabaseClient): Promise<AuthUser | null> {
  const { data, error } = await client.auth.getSession();
  if (error !== null) throw new OdinError(mapPostgrestError(error));
  const user = data.session?.user;
  return user === undefined ? null : { id: user.id, email: user.email ?? null };
}

export function onAuthStateChange(
  client: OdinSupabaseClient,
  listener: (user: AuthUser | null) => void,
): () => void {
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    const user = session?.user;
    listener(user === undefined ? null : { id: user.id, email: user.email ?? null });
  });
  return () => data.subscription.unsubscribe();
}

/** An invalid or expired code must read as a validation problem, not a crash. */
function mapAuthError(status: number | undefined, message: string) {
  if (status === 429) return commandError('RATE_LIMITED');
  if (status === 401 || status === 403) return commandError('UNAUTHENTICATED');
  if (status === 400) {
    const normalized = message.toLowerCase();
    if (normalized.includes('expired')) {
      return commandError('VALIDATION', 'validation.code.expired');
    }
    return commandError('VALIDATION', 'validation.code.invalid');
  }
  return commandError('UNKNOWN');
}
