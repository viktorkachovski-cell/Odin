/**
 * Initials plus a deterministic, accessible colour satisfy the avatar fallback
 * requirement without Storage. The colour is derived from the stable user id so
 * every client and session renders the same person identically.
 *
 * Colour is never the only signal: the display name always accompanies the chip.
 */

/** Hue slots chosen to stay distinguishable and to keep contrast predictable. */
const HUE_SLOTS = 12;

export function initialsOf(displayName: string): string {
  const words = displayName
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) return '?';
  const first = [...(words[0] ?? '')][0] ?? '';
  if (words.length === 1) return first.toLocaleUpperCase();
  const last = [...(words[words.length - 1] ?? '')][0] ?? '';
  return `${first}${last}`.toLocaleUpperCase();
}

/** FNV-1a: small, stable across runtimes, and good enough for bucketing. */
function hash(value: string): number {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193) >>> 0;
  }
  return result >>> 0;
}

export function avatarHue(userId: string): number {
  return Math.round((hash(userId) % HUE_SLOTS) * (360 / HUE_SLOTS));
}
