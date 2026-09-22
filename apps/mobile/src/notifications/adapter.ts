import * as Notifications from 'expo-notifications';

/**
 * The only module that talks to `expo-notifications`. Everything above it
 * works in plain strings and milliseconds, so the orchestration is testable
 * without a device and a future transport (a real push channel) replaces this
 * file rather than the rules around it.
 *
 * Delivery is local to the device: Android's alarm service holds the scheduled
 * deadline reminders, so those still arrive when Odin is not running. Anything
 * presented from a change the app observed needs the process to be alive.
 */

/** Android 8+ requires a channel; a notification posted without one is dropped. */
export const TASK_CHANNEL_ID = 'odin-tasks';

/**
 * Namespaces the scheduled reminders this app owns. Reconciliation cancels
 * every scheduled identifier under it that is no longer wanted, so it must
 * never match a notification scheduled by anything else.
 */
const REMINDER_PREFIX = 'odin-due:';

export interface NotificationText {
  readonly title: string;
  readonly body: string;
}

export interface PermissionState {
  readonly granted: boolean;
  /** False once Android has been told "don't ask again"; only Settings can undo it. */
  readonly canAskAgain: boolean;
}

/**
 * A deadline reminder must still appear when the member happens to be looking
 * at the app, so the handler shows every notification rather than suppressing
 * foreground delivery.
 */
export function installForegroundPresentation(): void {
  Notifications.setNotificationHandler({
    handleNotification: () =>
      Promise.resolve({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
  });
}

export async function ensureTaskChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync(TASK_CHANNEL_ID, {
    name: 'Tasks',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

function toState(status: {
  readonly granted: boolean;
  readonly canAskAgain: boolean;
}): PermissionState {
  return { granted: status.granted, canAskAgain: status.canAskAgain };
}

export async function readPermission(): Promise<PermissionState> {
  return toState(await Notifications.getPermissionsAsync());
}

export async function askPermission(): Promise<PermissionState> {
  return toState(await Notifications.requestPermissionsAsync());
}

/** Posts immediately. `trigger: null` is expo's "deliver now". */
export async function presentNow(text: NotificationText): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title: text.title, body: text.body },
    trigger: null,
  });
}

export function reminderIdentifier(locale: string, key: string): string {
  return `${REMINDER_PREFIX}${locale}:${key}`;
}

/**
 * Identifiers of the reminders this app currently has scheduled. Reading them
 * back from the system -- rather than trusting a local record -- is what makes
 * reconciliation safe across a restart, a reinstall of the JS bundle or a
 * notification the user dismissed.
 */
export async function scheduledReminderIds(): Promise<readonly string[]> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled
    .map((request) => request.identifier)
    .filter((identifier) => identifier.startsWith(REMINDER_PREFIX));
}

export async function scheduleReminder(
  identifier: string,
  fireAtMs: number,
  text: NotificationText,
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: { title: text.title, body: text.body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAtMs,
      channelId: TASK_CHANNEL_ID,
    },
  });
}

export async function cancelReminders(identifiers: readonly string[]): Promise<void> {
  await Promise.all(
    identifiers.map((identifier) => Notifications.cancelScheduledNotificationAsync(identifier)),
  );
}

/** Used when the member mutes Odin's notifications or signs out. */
export async function cancelAllReminders(): Promise<void> {
  await cancelReminders(await scheduledReminderIds());
}
