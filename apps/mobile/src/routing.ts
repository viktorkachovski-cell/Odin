/**
 * A `next` destination arrives from a deep link, so it is attacker-influenced.
 * Only an in-app absolute path is ever used; anything protocol-relative,
 * absolute-URL, backslash-escaped or carrying control characters falls back to
 * Home rather than sending the person somewhere unexpected.
 */

export type InternalPath = `/${string}`;

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function safeInternalPath(candidate: string | undefined | null): InternalPath {
  if (candidate === undefined || candidate === null) return '/';
  const value = candidate.trim();

  if (!value.startsWith('/')) return '/';
  if (value.startsWith('//')) return '/';
  if (value.includes('\\')) return '/';
  if (value.includes(':')) return '/';
  if (hasControlCharacter(value)) return '/';

  return value as InternalPath;
}

/**
 * The authentication routes themselves are never a valid post-login
 * destination: carrying `/sign-in` through a successful sign-in bounces the
 * person straight back to the form they just completed. Anything else that
 * survives `safeInternalPath` is kept as-is.
 */
const AUTH_ROUTES: readonly string[] = [
  '/sign-in',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-code',
];

export function safeAuthDestination(candidate: string | undefined | null): InternalPath {
  const path = safeInternalPath(candidate);
  const [rawPathname = ''] = path.split(/[?#]/);

  let pathname: string;
  try {
    pathname = decodeURIComponent(rawPathname);
  } catch {
    // A malformed percent-escape is not a path we are willing to navigate to.
    return '/';
  }

  const normalised = pathname.replace(/\/+$/, '').toLowerCase();
  return AUTH_ROUTES.includes(normalised) ? '/' : path;
}

/**
 * Extracts an invitation token from a deep link's fragment (`odin://invite#token=...`).
 * A query parameter is deliberately not accepted: the contract keeps the token
 * out of request paths, and honouring both would quietly undo that.
 */
export function tokenFromDeepLink(url: string | null | undefined): string | null {
  if (url === null || url === undefined) return null;
  // Only the registered invitation routes may carry invitation credentials.
  const base = url.split(/[?#]/)[0];
  if (
    base !== 'odin://invite' &&
    base !== 'odin://invite/' &&
    base !== 'https://odin-ten-tau.vercel.app/invite'
  )
    return null;
  const hashIndex = url.indexOf('#');
  if (hashIndex < 0) return null;

  const token = new URLSearchParams(url.slice(hashIndex + 1)).get('token');
  if (token === null) return null;

  const trimmed = token.trim();
  return trimmed.length === 0 ? null : trimmed;
}
