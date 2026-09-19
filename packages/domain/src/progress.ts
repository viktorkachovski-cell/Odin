/**
 * Progress is shared by both clients and mirrored by the server aggregate.
 * An empty list is 0 percent, never a division by zero.
 *
 * Rounding is positive-half-up, which is NOT what Math.round gives for
 * negative inputs -- counts are non-negative here, but the helper stays
 * explicit so the rule is obvious and testable.
 */

export function progressPercent(completed: number, total: number): number {
  if (!Number.isFinite(completed) || !Number.isFinite(total)) {
    throw new RangeError('progressPercent requires finite counts');
  }
  if (total < 0 || completed < 0) {
    throw new RangeError('progressPercent requires non-negative counts');
  }
  if (total === 0) return 0;
  const clamped = Math.min(completed, total);
  return Math.floor((clamped * 100) / total + 0.5);
}

export function isListComplete(completed: number, total: number): boolean {
  return total > 0 && completed >= total;
}
