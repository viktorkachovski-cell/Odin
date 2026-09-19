/**
 * Client-side validation improves usability; the server validates again at its
 * own trust boundary. Both use the same limits and the same message keys so an
 * optimistic rejection reads identically to a server one.
 *
 * Lengths are counted in Unicode code points, so an emoji or a Cyrillic
 * character counts once -- `String.length` would count UTF-16 units instead.
 */

import { LIMITS } from '@odin/contracts';

export interface FieldIssue {
  readonly field: string;
  readonly message_key: string;
}

export function codePointLength(value: string): number {
  return [...value].length;
}

export function normalizeText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function checkText(
  raw: string | null | undefined,
  field: string,
  bounds: { readonly min: number; readonly max: number },
  required: boolean,
): FieldIssue | null {
  const value = normalizeText(raw);
  if (value === null) {
    return required ? { field, message_key: `validation.${field}.required` } : null;
  }
  const length = codePointLength(value);
  if (length < bounds.min || length > bounds.max) {
    return { field, message_key: `validation.${field}.length` };
  }
  return null;
}

export function validateTitle(value: string | null | undefined): FieldIssue | null {
  return checkText(value, 'title', LIMITS.title, true);
}

export function validateSubtitle(value: string | null | undefined): FieldIssue | null {
  return checkText(value, 'subtitle', LIMITS.subtitle, false);
}

export function validateDisplayName(value: string | null | undefined): FieldIssue | null {
  return checkText(value, 'display_name', LIMITS.displayName, true);
}

export function validateHouseholdName(value: string | null | undefined): FieldIssue | null {
  return checkText(value, 'name', LIMITS.householdName, true);
}

export function collectIssues(...issues: readonly (FieldIssue | null)[]): FieldIssue[] {
  return issues.filter((issue): issue is FieldIssue => issue !== null);
}
