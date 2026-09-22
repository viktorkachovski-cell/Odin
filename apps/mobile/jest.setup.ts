// Testing Library's matchers are built in from v12.4, so no extend-expect import.
/**
 * The keystore is native, so the suite drives an in-memory double. Every test
 * that touches it clears the store itself, which keeps ordering irrelevant.
 */
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItemAsync: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setItemAsync: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
  };
});

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-GB', languageCode: 'en' }],
}));

jest.mock('expo-linking', () => ({
  getInitialURL: jest.fn(() => Promise.resolve(null)),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
}));

/**
 * Safe-area insets come from a native module. The library's own mock returns
 * fixed insets so screens that frame themselves with them still render.
 */
jest.mock('react-native-safe-area-context', () => {
  // The library ships its mock as a default export that already re-exports the
  // real components; spreading the module namespace instead would drop them.
  const mocked = jest.requireActual<{ default: object }>(
    'react-native-safe-area-context/jest/mock',
  );
  return mocked.default;
});

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true })),
}));

/**
 * Notifications are native too. The double keeps the scheduled set in memory
 * and records what was presented, so tests assert on delivery and on
 * reconciliation rather than on which functions were called. Tests that touch
 * it reset it themselves through `__reset`, keeping ordering irrelevant.
 *
 * These types sit outside the factory on purpose: a declaration inside one
 * reads to Babel's hoisting guard as an out-of-scope variable, and every suite
 * then fails to transform.
 */
interface MockNotificationContent {
  readonly title?: string | null;
  readonly body?: string | null;
}

interface MockScheduled {
  readonly identifier: string;
  readonly fireAtMs: number;
  readonly content: MockNotificationContent;
}

interface MockNotificationRequest {
  readonly identifier?: string;
  readonly content: MockNotificationContent;
  readonly trigger: { readonly date: number } | null;
}

jest.mock('expo-notifications', () => {
  const scheduled = new Map<string, MockScheduled>();
  const presented: MockNotificationContent[] = [];
  const permission = { granted: true, canAskAgain: true, status: 'granted' };
  let generated = 0;

  return {
    __scheduled: scheduled,
    __presented: presented,
    __permission: permission,
    __reset: (granted = true, canAskAgain = true) => {
      scheduled.clear();
      presented.length = 0;
      permission.granted = granted;
      permission.canAskAgain = canAskAgain;
      generated = 0;
    },
    AndroidImportance: { DEFAULT: 5 },
    SchedulableTriggerInputTypes: { DATE: 'date' },
    setNotificationHandler: jest.fn(),
    setNotificationChannelAsync: jest.fn(() => Promise.resolve(null)),
    getPermissionsAsync: jest.fn(() => Promise.resolve({ ...permission })),
    requestPermissionsAsync: jest.fn(() => Promise.resolve({ ...permission })),
    scheduleNotificationAsync: jest.fn((request: MockNotificationRequest) => {
      // A null trigger is expo's "deliver now", which is how announcements post.
      if (request.trigger === null) {
        presented.push(request.content);
        return Promise.resolve('presented');
      }
      generated += 1;
      const identifier = request.identifier ?? `generated-${String(generated)}`;
      scheduled.set(identifier, {
        identifier,
        fireAtMs: request.trigger.date,
        content: request.content,
      });
      return Promise.resolve(identifier);
    }),
    getAllScheduledNotificationsAsync: jest.fn(() =>
      Promise.resolve(
        [...scheduled.values()].map((entry) => ({
          identifier: entry.identifier,
          content: entry.content,
          trigger: { date: entry.fireAtMs },
        })),
      ),
    ),
    cancelScheduledNotificationAsync: jest.fn((identifier: string) => {
      scheduled.delete(identifier);
      return Promise.resolve();
    }),
  };
});
