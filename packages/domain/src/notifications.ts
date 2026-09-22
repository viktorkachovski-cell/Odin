/**
 * What the app notifies about, kept pure. The client decides *how* to deliver
 * a notification; this file decides *whether* there is one and *when* it fires.
 * Nothing here touches a platform API, an ambient clock or a translation, so
 * both rules are testable without a device.
 *
 * Owner amendment of 2026-09-22 (see docs/decisions.md): a member is told when
 * a task becomes theirs, when a task of theirs changes, and three times as a
 * deadline approaches.
 */

export const DUE_REMINDER_STAGES = ['day', 'hours', 'imminent'] as const;

export type DueReminderStage = (typeof DUE_REMINDER_STAGES)[number];

const HOUR_MS = 60 * 60 * 1000;

/**
 * How far ahead of the deadline each stage fires. The ladder is owner-selected
 * and deliberately widening, so the three reminders do not arrive as one burst.
 */
export const DUE_REMINDER_LEAD_MS: Readonly<Record<DueReminderStage, number>> = {
  day: 24 * HOUR_MS,
  hours: 4 * HOUR_MS,
  imminent: HOUR_MS,
};

export interface DueReminderCandidate {
  readonly id: string;
  readonly title: string;
  readonly listTitle: string;
  readonly dueAt: string | null;
}

export interface PlannedDueReminder {
  /** Stable per task and stage, so replanning replaces rather than duplicates. */
  readonly key: string;
  readonly taskId: string;
  readonly stage: DueReminderStage;
  readonly fireAtMs: number;
  readonly title: string;
  readonly listTitle: string;
}

export function dueReminderKey(taskId: string, stage: DueReminderStage): string {
  return `${taskId}:${stage}`;
}

/**
 * Every stage of every dated task that is still ahead of `nowMs`.
 *
 * A stage whose moment has already passed is skipped rather than fired late: a
 * "due in 4 hours" warning delivered 20 minutes before the deadline misinforms.
 * A task created inside its own last hour therefore gets no deadline reminder,
 * only the assignment notification.
 */
export function planDueReminders(
  tasks: readonly DueReminderCandidate[],
  nowMs: number,
): readonly PlannedDueReminder[] {
  const planned: PlannedDueReminder[] = [];
  const seen = new Set<string>();

  for (const task of tasks) {
    if (task.dueAt === null || seen.has(task.id)) continue;
    seen.add(task.id);

    const dueMs = Date.parse(task.dueAt);
    if (Number.isNaN(dueMs)) continue;

    for (const stage of DUE_REMINDER_STAGES) {
      const fireAtMs = dueMs - DUE_REMINDER_LEAD_MS[stage];
      if (fireAtMs <= nowMs) continue;
      planned.push({
        key: dueReminderKey(task.id, stage),
        taskId: task.id,
        stage,
        fireAtMs,
        title: task.title,
        listTitle: task.listTitle,
      });
    }
  }

  return planned;
}

export interface AssignedTaskState {
  readonly id: string;
  readonly version: number;
}

export interface AssignedTaskChanges {
  readonly assigned: readonly string[];
  readonly updated: readonly string[];
}

/**
 * Compares two readings of "tasks assigned to me". A task that was not there
 * before became mine; a task whose version advanced was edited by someone.
 * Version is the contract's own change marker, so an edit that leaves every
 * visible field alone still counts and a refetch that changes nothing does not.
 *
 * `previous === null` is the baseline taken at sign-in or app start: what is
 * already assigned then is history, not news, and must not arrive as a burst
 * of notifications.
 */
export function diffAssignedTasks(
  previous: readonly AssignedTaskState[] | null,
  next: readonly AssignedTaskState[],
): AssignedTaskChanges {
  if (previous === null) return { assigned: [], updated: [] };

  const before = new Map(previous.map((task) => [task.id, task.version]));
  const assigned: string[] = [];
  const updated: string[] = [];

  for (const task of next) {
    const knownVersion = before.get(task.id);
    if (knownVersion === undefined) assigned.push(task.id);
    else if (task.version > knownVersion) updated.push(task.id);
  }

  return { assigned, updated };
}
