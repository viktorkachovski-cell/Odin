import { restoreEmailSession, type OdinSupabaseClient } from '@odin/data';

type EmailLink =
  | { readonly kind: 'none' | 'invalid' }
  | {
      readonly kind: 'session';
      readonly access_token: string;
      readonly refresh_token: string;
      readonly recovery: boolean;
    };
const RECOVERY_KEY = 'odin.password-recovery';
let recoveryUser: { id: string; expires: number } | null = null;
let confirmed = false;

/** Capture before React mounts. Invite fragments are left untouched. */
export function captureEmailLink(location: Location, history: History): EmailLink {
  const hash = new URLSearchParams(location.hash.slice(1));
  const query = new URLSearchParams(location.search);
  const hasAuth =
    ['access_token', 'refresh_token', 'error', 'error_code', 'error_description', 'type'].some(
      (key) => hash.has(key),
    ) ||
    query.has('error') ||
    query.has('error_code');
  if (!hasAuth) return { kind: 'none' };
  const hasError = hash.has('error') || query.has('error') || query.has('error_code');
  for (const key of ['error', 'error_code', 'error_description']) query.delete(key);
  const search = query.toString();
  history.replaceState(null, '', location.pathname + (search ? `?${search}` : ''));
  const access_token = hash.get('access_token');
  const refresh_token = hash.get('refresh_token');
  const type = hash.get('type');
  if (
    hasError ||
    !access_token ||
    !refresh_token ||
    !['signup', 'recovery', 'magiclink', 'email'].includes(type ?? '')
  )
    return { kind: 'invalid' };
  return { kind: 'session', access_token, refresh_token, recovery: type === 'recovery' };
}

export function setRecoveryUser(id: string | null): void {
  recoveryUser = id === null ? null : { id, expires: Date.now() + 60 * 60 * 1000 };
  try {
    if (recoveryUser === null) window.sessionStorage.removeItem(RECOVERY_KEY);
    else window.sessionStorage.setItem(RECOVERY_KEY, JSON.stringify(recoveryUser));
  } catch {
    /* Memory fallback. No credentials are stored here. */
  }
}

export function isRecoveryUser(id: string | undefined): boolean {
  try {
    const saved: unknown = JSON.parse(window.sessionStorage.getItem(RECOVERY_KEY) ?? 'null');
    if (
      typeof saved === 'object' &&
      saved !== null &&
      'id' in saved &&
      'expires' in saved &&
      typeof saved.id === 'string' &&
      typeof saved.expires === 'number'
    ) {
      recoveryUser = { id: saved.id, expires: saved.expires };
    }
  } catch {
    /* Use memory fallback. */
  }
  return recoveryUser !== null && recoveryUser.id === id && recoveryUser.expires > Date.now();
}

export function emailLinkConfirmed(): boolean {
  return confirmed;
}

export async function completeEmailLink(
  client: OdinSupabaseClient,
  link: EmailLink,
  history: History,
): Promise<void> {
  if (link.kind === 'none') return;
  confirmed = false;
  setRecoveryUser(null);
  if (link.kind === 'session') {
    const result = await restoreEmailSession(client, link);
    if (result.ok) {
      if (link.recovery) setRecoveryUser(result.data.id);
      else confirmed = true;
      history.replaceState(null, '', link.recovery ? '/reset-password' : '/auth/confirmed');
      return;
    }
  }
  history.replaceState(null, '', '/sign-in?authError=invalid');
}
