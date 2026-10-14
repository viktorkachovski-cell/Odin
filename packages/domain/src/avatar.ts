/**
 * Initials plus a deterministic, accessible colour satisfy the avatar fallback
 * requirement without Storage. Hues are spread evenly across the household's
 * members, ordered by stable user id, so two members never share a colour and
 * every client renders the same person identically.
 *
 * Colour is never the only signal: the display name always accompanies the chip.
 */

import type { MemberDto } from '@odin/contracts';

/** Fallback slots for someone outside the loaded member list. */
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

export function avatarHue(userId: string, members: readonly MemberDto[]): number {
  const ids = members.map((member) => member.user_id).sort();
  const index = ids.indexOf(userId);
  if (index === -1) return Math.round((hash(userId) % HUE_SLOTS) * (360 / HUE_SLOTS));
  return Math.round((index * 360) / ids.length);
}
