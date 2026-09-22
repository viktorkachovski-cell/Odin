import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  askPermission,
  cancelAllReminders,
  ensureTaskChannel,
  installForegroundPresentation,
  readPermission,
} from '../notifications/adapter.ts';
import { readMuted, writeMuted } from '../notifications/preference.ts';
import { useAppForeground } from './useAppForeground.ts';
import { useTaskNotifications } from './useTaskNotifications.ts';

/**
 * Owns whether this device may notify at all, and runs the watcher that does.
 *
 * Two independent switches decide it. Android grants or refuses the permission,
 * and the member can mute Odin without touching the system setting. Both must
 * say yes, which is what "if app notifications are enabled" means here.
 */

export type NotificationPermission =
  | 'unknown'
  /** Granted, but never yet requested on this device. */
  | 'granted'
  | 'denied'
  /** Refused with "don't ask again": only the Android settings screen can undo it. */
  | 'blocked';

export interface NotificationSettingsValue {
  readonly permission: NotificationPermission;
  readonly muted: boolean;
  /** True while a permission prompt or a stored preference write is in flight. */
  readonly busy: boolean;
  readonly enable: () => void;
  readonly disable: () => void;
}

const NotificationSettingsContext = createContext<NotificationSettingsValue | null>(null);

function classify(state: {
  readonly granted: boolean;
  readonly canAskAgain: boolean;
}): NotificationPermission {
  if (state.granted) return 'granted';
  return state.canAskAgain ? 'denied' : 'blocked';
}

function useNotificationGate(): NotificationSettingsValue {
  const [permission, setPermission] = useState<NotificationPermission>('unknown');
  const [muted, setMuted] = useState(false);
  const [busy, setBusy] = useState(false);
  const foreground = useAppForeground();

  useEffect(() => {
    // The channel and the foreground handler are idempotent, and Android drops
    // a notification posted to a channel that does not exist yet.
    installForegroundPresentation();
    void ensureTaskChannel().catch(() => undefined);
  }, []);

  /**
   * Re-read on every return to the foreground: the member may have changed the
   * permission in the Android settings while Odin was away, and a stale "on"
   * would leave the app promising notifications it can no longer post.
   */
  useEffect(() => {
    if (!foreground) return;
    let cancelled = false;
    void (async () => {
      try {
        const [state, storedMute] = await Promise.all([readPermission(), readMuted()]);
        if (cancelled) return;
        setPermission(classify(state));
        setMuted(storedMute);
      } catch {
        if (!cancelled) setPermission('unknown');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [foreground]);

  const enable = useCallback(() => {
    setBusy(true);
    void (async () => {
      try {
        const state = await askPermission();
        setPermission(classify(state));
        if (state.granted) {
          await writeMuted(false);
          setMuted(false);
        }
      } catch {
        setPermission('unknown');
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  const disable = useCallback(() => {
    setBusy(true);
    void (async () => {
      try {
        await writeMuted(true);
        setMuted(true);
        // Reminders already handed to Android would otherwise keep firing.
        await cancelAllReminders();
      } catch {
        // The stored preference is the source of truth; a failed cancel is
        // retried by the next reconciliation.
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  return useMemo(
    () => ({ permission, muted, busy, enable, disable }),
    [permission, muted, busy, enable, disable],
  );
}

export function NotificationsProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const value = useNotificationGate();
  useTaskNotifications(value.permission === 'granted' && !value.muted);
  return <NotificationSettingsContext value={value}>{children}</NotificationSettingsContext>;
}

/**
 * Outside the authenticated shell there is nothing to notify about, so an
 * inert value keeps Settings renderable on its own in tests.
 */
export function useNotificationSettings(): NotificationSettingsValue {
  return (
    use(NotificationSettingsContext) ?? {
      permission: 'unknown',
      muted: false,
      busy: false,
      enable: () => undefined,
      disable: () => undefined,
    }
  );
}
