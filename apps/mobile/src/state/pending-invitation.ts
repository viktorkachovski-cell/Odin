/**
 * A pending invitation token lives only in this module's memory.
 *
 * It has to survive the sign-in or registration round trip, during which the
 * invite route unmounts, so it cannot live in that screen's state. It must not
 * survive anything else: it is never written to SecureStore, AsyncStorage, a
 * route parameter, the query cache, a log or analytics, because it is a bearer
 * credential. Killing the app therefore drops it, and the invite screen asks
 * the person to reopen the original invitation.
 */

let token: string | null = null;

export function rememberInvitation(value: string): void {
  token = value;
}

export function getPendingInvitation(): string | null {
  return token;
}

export function clearPendingInvitation(): void {
  token = null;
}
