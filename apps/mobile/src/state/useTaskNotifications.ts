import { useEffect, useRef } from 'react';

import type { HouseholdTaskDto } from '@odin/contracts';
import {
  diffAssignedTasks,
  planDueReminders,
  type AssignedTaskState,
  type DueReminderCandidate,
  type DueReminderStage,
  type PlannedDueReminder,
} from '@odin/domain';
import { translate, type Locale, type TranslationKey } from '@odin/i18n';

import {
  cancelAllReminders,
  cancelReminders,
  presentNow,
  reminderIdentifier,
  scheduleReminder,
  scheduledReminderIds,
  type NotificationText,
} from '../notifications/adapter.ts';
import { useOdin } from './OdinContext.ts';
import { useAppForeground } from './useAppForeground.ts';
import { useMyTasksQuery, useUnassignedQuery } from './queries.ts';

/**
 * The three notifications: a task became yours, a task of yours changed, and a
 * deadline is near. "Assigned" and "updated" compare two readings of My Tasks
 * by version, and are only announced while the app is not in the foreground,
 * which is also what keeps your own edits silent (docs/android.md).
 */

/** At this many changes in one sync, one summary replaces the individual ones. */
const SUMMARY_THRESHOLD = 2;

const DUE_TITLE_KEYS: Readonly<Record<DueReminderStage, TranslationKey>> = {
  day: 'notification.due.day.title',
  hours: 'notification.due.hours.title',
  imminent: 'notification.due.imminent.title',
};

function toCandidate(task: HouseholdTaskDto): DueReminderCandidate {
  return {
    id: task.id,
    title: task.title,
    listTitle: task.list_title,
    dueAt: task.due_at,
  };
}

function toAssignedState(task: HouseholdTaskDto): AssignedTaskState {
  return { id: task.id, version: task.version };
}

function reminderText(locale: Locale, plan: PlannedDueReminder): NotificationText {
  return {
    title: translate(locale, DUE_TITLE_KEYS[plan.stage]),
    body: translate(locale, 'notification.body', { title: plan.title, list: plan.listTitle }),
  };
}

/**
 * Brings the system's scheduled reminders in line with the deadlines currently
 * on screen. The set already scheduled is read back from Android rather than
 * remembered here, so this stays correct across a restart, and identifiers are
 * stable per task, stage and language -- rescheduling replaces, never
 * duplicates, and a language change retires the old wording.
 */
async function reconcileReminders(
  candidates: readonly DueReminderCandidate[],
  locale: Locale,
  nowMs: number,
): Promise<void> {
  const wanted = new Map(
    planDueReminders(candidates, nowMs).map((plan) => [reminderIdentifier(locale, plan.key), plan]),
  );
  const existing = await scheduledReminderIds();

  await cancelReminders(existing.filter((identifier) => !wanted.has(identifier)));

  const alreadyScheduled = new Set(existing);
  for (const [identifier, plan] of wanted) {
    if (alreadyScheduled.has(identifier)) continue;
    await scheduleReminder(identifier, plan.fireAtMs, reminderText(locale, plan));
  }
}

function announce(
  locale: Locale,
  changed: readonly string[],
  tasks: ReadonlyMap<string, HouseholdTaskDto>,
  keys: {
    readonly one: TranslationKey;
    readonly manyTitle: TranslationKey;
    readonly manyBody: TranslationKey;
  },
): readonly NotificationText[] {
  if (changed.length === 0) return [];

  if (changed.length >= SUMMARY_THRESHOLD) {
    return [
      {
        title: translate(locale, keys.manyTitle),
        body: translate(locale, keys.manyBody, { count: changed.length }),
      },
    ];
  }

  return changed.flatMap((id) => {
    const task = tasks.get(id);
    return task === undefined
      ? []
      : [
          {
            title: translate(locale, keys.one),
            body: translate(locale, 'notification.body', {
              title: task.title,
              list: task.list_title,
            }),
          },
        ];
  });
}

/**
 * Best effort by design: a notification that cannot be posted must never break
 * the screen behind it or surface a technical error to a member. The message
 * is deliberately generic -- household text never reaches a log.
 */
function bestEffort(work: Promise<unknown>): void {
  void work.catch(() => {
    console.warn('Odin could not update device notifications.');
  });
}

export function useTaskNotifications(allowed: boolean): void {
  const { locale } = useOdin();
  const foreground = useAppForeground();
  // Live app-wide while notifications are on, because a change has to be
  // noticed whichever section is open and while none is. Switched off, they
  // cost nothing: the My Tasks and Unassigned screens still enable their own.
  const myTasks = useMyTasksQuery(allowed);
  const unassigned = useUnassignedQuery(allowed);

  const myItems = myTasks.data?.items;
  const unassignedItems = unassigned.data?.items;

  /**
   * What "assigned to me" looked like at the last reading. `null` is the
   * baseline taken at start-up: the tasks already yours then are not news.
   */
  const baseline = useRef<readonly AssignedTaskState[] | null>(null);

  useEffect(() => {
    if (myItems === undefined) return;

    const previous = baseline.current;
    baseline.current = myItems.map(toAssignedState);

    // The baseline is always advanced, even while silent, so re-enabling
    // notifications cannot replay a backlog of changes already seen.
    if (!allowed || foreground) return;

    const changes = diffAssignedTasks(previous, baseline.current);
    const byId = new Map(myItems.map((task) => [task.id, task]));
    const texts = [
      ...announce(locale, changes.assigned, byId, {
        one: 'notification.assigned.title',
        manyTitle: 'notification.assigned.many.title',
        manyBody: 'notification.assigned.many.body',
      }),
      ...announce(locale, changes.updated, byId, {
        one: 'notification.updated.title',
        manyTitle: 'notification.updated.many.title',
        manyBody: 'notification.updated.many.body',
      }),
    ];

    for (const text of texts) bestEffort(presentNow(text));
  }, [myItems, allowed, foreground, locale]);

  /**
   * Deadline reminders are held by Android's alarm service, so unlike the
   * announcements above they still arrive when Odin is not running.
   */
  useEffect(() => {
    if (!allowed) {
      bestEffort(cancelAllReminders());
      return;
    }
    if (myItems === undefined || unassignedItems === undefined) return;

    const candidates = [...myItems, ...unassignedItems].map(toCandidate);
    bestEffort(reconcileReminders(candidates, locale, Date.now()));
  }, [myItems, unassignedItems, allowed, locale]);
}
