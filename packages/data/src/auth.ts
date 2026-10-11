/** Session helpers over the supported Supabase Auth APIs; password flows are in `password-auth.ts`. */

import type { OdinSupabaseClient } from './client.ts';
import { mapPostgrestError, OdinError } from './error-mapping.ts';

export interface AuthUser {
  readonly id: string;
  readonly email: string | null;
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
