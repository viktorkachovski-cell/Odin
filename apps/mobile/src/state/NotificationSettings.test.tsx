import { act, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { createTranslator } from '@odin/i18n';

/**
 * The gate: Android's permission and the member's own mute must both allow a
 * notification. Tests drive the in-memory `expo-notifications` double, so
 * "granted" and "blocked" are the states Android would actually report.
 */

interface NotificationDouble {
  readonly __scheduled: Map<string, { readonly identifier: string }>;
  readonly __reset: (granted?: boolean, canAskAgain?: boolean) => void;
  readonly requestPermissionsAsync: jest.Mock;
}

const native = jest.requireMock<NotificationDouble>('expo-notifications');
const secureStore = jest.requireMock<{ __store: Map<string, string> }>('expo-secure-store');

const mockContext = { locale: 'en' as const, t: createTranslator('en') };

jest.mock('./OdinContext.ts', () => ({ useOdin: () => mockContext }));
jest.mock('./useAppForeground.ts', () => ({ useAppForeground: () => true }));
jest.mock('./queries.ts', () => ({
  useMyTasksQuery: () => ({ data: { items: [], next_cursor: null } }),
  useUnassignedQuery: () => ({ data: { items: [], next_cursor: null } }),
}));

import { NotificationsProvider, useNotificationSettings } from './NotificationSettings.tsx';
import { NotificationToggle } from '../components/NotificationToggle.tsx';

function wrapper({ children }: { readonly children: ReactNode }): ReactNode {
  return <NotificationsProvider>{children}</NotificationsProvider>;
}

beforeEach(() => {
  native.__reset();
  secureStore.__store.clear();
  jest.clearAllMocks();
});

describe('the notification gate', () => {
  it('is on once Android grants permission and nothing is muted', async () => {
    const { result } = await renderHook(() => useNotificationSettings(), { wrapper });

    await waitFor(() => expect(result.current.permission).toBe('granted'));
    expect(result.current.muted).toBe(false);
  });

  it('reports a refusal that can still be asked about again as denied', async () => {
    native.__reset(false, true);
    const { result } = await renderHook(() => useNotificationSettings(), { wrapper });

    await waitFor(() => expect(result.current.permission).toBe('denied'));
  });

  it('reports "do not ask again" as blocked rather than offering a useless button', async () => {
    native.__reset(false, false);
    const { result } = await renderHook(() => useNotificationSettings(), { wrapper });

    await waitFor(() => expect(result.current.permission).toBe('blocked'));
  });

  it('remembers a mute on the device and drops the reminders Android holds', async () => {
    const { result } = await renderHook(() => useNotificationSettings(), { wrapper });
    await waitFor(() => expect(result.current.permission).toBe('granted'));

    const identifier = 'odin-due:en:t1:day';
    native.__scheduled.set(identifier, { identifier });
    await act(() => result.current.disable());

    await waitFor(() => expect(result.current.muted).toBe(true));
    // Cancelling runs after the preference is stored, so it settles a tick later.
    await waitFor(() => expect(native.__scheduled.size).toBe(0));
    expect(secureStore.__store.get('odin.notifications.muted')).toBe('true');
  });

  it('asks Android only when the member turns notifications on', async () => {
    native.__reset(false, true);
    const { result } = await renderHook(() => useNotificationSettings(), { wrapper });
    await waitFor(() => expect(result.current.permission).toBe('denied'));
    expect(native.requestPermissionsAsync).not.toHaveBeenCalled();

    await act(() => result.current.enable());
    await waitFor(() => expect(native.requestPermissionsAsync).toHaveBeenCalledTimes(1));
  });
});

describe('the Settings control', () => {
  it('sends a blocked member to the Android settings instead of a dead button', async () => {
    native.__reset(false, false);
    await render(
      <NotificationsProvider>
        <NotificationToggle />
      </NotificationsProvider>,
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          'Android is blocking notifications for Odin. Turn them on in the Android settings for this app.',
        ),
      ).toBeTruthy(),
    );
    expect(screen.queryByText('Turn on notifications')).toBeNull();
  });

  it('offers to turn notifications on while they are off', async () => {
    native.__reset(false, true);
    await render(
      <NotificationsProvider>
        <NotificationToggle />
      </NotificationsProvider>,
    );

    await waitFor(() => expect(screen.getByText('Turn on notifications')).toBeTruthy());
    expect(screen.getByText('Notifications are off.')).toBeTruthy();
  });
});
