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
