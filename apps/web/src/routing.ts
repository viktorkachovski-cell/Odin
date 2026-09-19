/**
 * Redirect safety. A destination carried through sign-in must be an internal
 * path: anything protocol-relative, absolute, or otherwise externally
 * resolvable is discarded rather than followed.
 */

const DEFAULT_DESTINATION = '/';

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

export function safeInternalPath(candidate: string | null | undefined): string {
  if (candidate === null || candidate === undefined) return DEFAULT_DESTINATION;

  const value = candidate.trim();
  if (value.length === 0) return DEFAULT_DESTINATION;

  // Must be a single-slash-rooted path: rejects "//evil.com" and "https://evil.com".
  if (!value.startsWith('/') || value.startsWith('//')) return DEFAULT_DESTINATION;

  // Backslashes are normalised to slashes by some browsers, so "/\evil.com" is unsafe.
  if (value.includes('\\')) return DEFAULT_DESTINATION;

  // A control character or a scheme separator has no place in a path. Checked by
  // code point rather than a regex literal, which would embed raw control chars.
  if (hasControlCharacter(value) || value.includes(':')) {
    return DEFAULT_DESTINATION;
  }

  return value;
}

/**
 * Invitation tokens travel in the URL fragment so they never reach the hosting
 * layer's request path or access logs. The fragment is cleared from visible
 * history immediately after capture.
 */
export function captureInviteToken(location: Location, history: History): string | null {
  const fragment = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
  if (fragment.length === 0) return null;

  const params = new URLSearchParams(fragment);
  const token = params.get('token') ?? (fragment.includes('=') ? null : fragment);
  if (token === null || token.length === 0) return null;

  history.replaceState(null, '', `${location.pathname}${location.search}`);
  return token;
}
