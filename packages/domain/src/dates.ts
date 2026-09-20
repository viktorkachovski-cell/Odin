/**
 * Deadlines are explicit local date + time converted to a UTC instant. There is
 * no implicit end-of-day and no date-only deadline (docs/01-DECISIONS.md).
 *
 * Spring-forward gaps are surfaced rather than silently shifted: 02:30 simply
 * does not exist on a day that jumps 02:00 -> 03:00, and the user is asked to
 * pick another time. Autumn fall-back times are ambiguous rather than invalid;
 * the platform resolves them to the first occurrence, which we accept and
 * document instead of inventing an offset picker.
 */

export interface LocalDateTimeInput {
  /** `YYYY-MM-DD` as produced by an <input type="date"> */
  readonly date: string;
  /** `HH:MM` as produced by an <input type="time"> */
  readonly time: string;
}

export type DueParseResult =
  | { readonly ok: true; readonly iso: string }
  | { readonly ok: false; readonly reason: 'invalid_format' | 'nonexistent_local_time' };

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

export function localInputToUtcIso(input: LocalDateTimeInput): DueParseResult {
  const dateMatch = DATE_PATTERN.exec(input.date);
  const timeMatch = TIME_PATTERN.exec(input.time);
  if (dateMatch === null || timeMatch === null) {
    return { ok: false, reason: 'invalid_format' };
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return { ok: false, reason: 'invalid_format' };
  }

  const candidate = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (Number.isNaN(candidate.getTime())) {
    return { ok: false, reason: 'invalid_format' };
  }

  // Reading the local fields back proves the wall-clock time really exists.
  // A DST gap makes the runtime normalise 02:30 to 03:30, which we reject.
  const roundTrips =
    candidate.getFullYear() === year &&
    candidate.getMonth() === month - 1 &&
    candidate.getDate() === day &&
    candidate.getHours() === hour &&
    candidate.getMinutes() === minute;

  if (!roundTrips) {
    return { ok: false, reason: 'nonexistent_local_time' };
  }

  return { ok: true, iso: candidate.toISOString() };
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

export function utcIsoToLocalInput(iso: string): LocalDateTimeInput | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return {
    date: `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`,
    time: `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`,
  };
}

/** A completed task is never overdue, however far past its deadline sits. */
export function isOverdue(
  task: { readonly due_at: string | null; readonly completed: boolean },
  now: Date = new Date(),
): boolean {
  if (task.completed || task.due_at === null) return false;
  const due = Date.parse(task.due_at);
  return !Number.isNaN(due) && due < now.getTime();
}

export interface TaskDueDraft {
  /** `YYYY-MM-DD`, or empty when no deadline is being set. */
  readonly dueDate: string;
  /** `HH:MM`, or empty when no deadline is being set. */
  readonly dueTime: string;
}

export type DueResolution =
  | { readonly ok: true; readonly dueAt: string | null }
  | { readonly ok: false; readonly reason: 'invalid_format' | 'nonexistent_local_time' };

/**
 * Both date and time, or neither. A half-filled deadline is rejected rather
 * than completed with an implicit end-of-day, which `01-DECISIONS.md` rules
 * out. Shared so the Android and web editors cannot drift apart on it.
 */
export function resolveDueInput(draft: TaskDueDraft): DueResolution {
  const hasDate = draft.dueDate.length > 0;
  const hasTime = draft.dueTime.length > 0;
  if (!hasDate && !hasTime) return { ok: true, dueAt: null };
  if (!hasDate || !hasTime) return { ok: false, reason: 'invalid_format' };

  const parsed = localInputToUtcIso({ date: draft.dueDate, time: draft.dueTime });
  return parsed.ok ? { ok: true, dueAt: parsed.iso } : { ok: false, reason: parsed.reason };
}

/** Splits a stored instant back into the editor's local date and time fields. */
export function dueDraftFromIso(dueAt: string | null | undefined): TaskDueDraft {
  const local = dueAt === null || dueAt === undefined ? null : utcIsoToLocalInput(dueAt);
  return { dueDate: local?.date ?? '', dueTime: local?.time ?? '' };
}
