import * as SecureStore from 'expo-secure-store';

import { createSecureSessionStorage } from './session-storage.ts';

const KEY = 'sb-example-auth-token';

/** Exposed by the in-memory double in jest.setup.ts. */
function backing(): Map<string, string> {
  return (SecureStore as unknown as { __store: Map<string, string> }).__store;
}

describe('secure session storage', () => {
  beforeEach(() => backing().clear());

  it('round-trips a small value without chunking it', async () => {
    const storage = createSecureSessionStorage();
    await storage.setItem(KEY, 'short');

    expect(backing().get(KEY)).toBe('short');
    await expect(storage.getItem(KEY)).resolves.toBe('short');
  });

  it('round-trips a session larger than the keystore value limit', async () => {
    const storage = createSecureSessionStorage();
    // Comfortably past Android's 2048-byte ceiling for a single value.
    const session = 'a'.repeat(4096);

    await storage.setItem(KEY, session);

    expect(backing().get(KEY)).toMatch(/^odin\.chunks:\d+$/);
    for (const [, value] of backing()) {
      expect(value.length).toBeLessThanOrEqual(512);
    }
    await expect(storage.getItem(KEY)).resolves.toBe(session);
  });

  it('never splits a surrogate pair across two chunks', async () => {
    const storage = createSecureSessionStorage();
    // Places an astral character exactly on the 512-character boundary.
    const session = `${'x'.repeat(511)}😀${'y'.repeat(600)}`;

    await storage.setItem(KEY, session);

    for (const [key, value] of backing()) {
      if (key === KEY) continue;
      const last = value.charCodeAt(value.length - 1);
      expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
    }
    await expect(storage.getItem(KEY)).resolves.toBe(session);
  });

  it('reports a partially written session as absent rather than corrupt', async () => {
    const storage = createSecureSessionStorage();
    await storage.setItem(KEY, 'b'.repeat(2000));

    backing().delete(`${KEY}.1`);

    await expect(storage.getItem(KEY)).resolves.toBeNull();
  });

  it('clears every chunk when the session is removed', async () => {
    const storage = createSecureSessionStorage();
    await storage.setItem(KEY, 'c'.repeat(2000));

    await storage.removeItem(KEY);

    expect(backing().size).toBe(0);
    await expect(storage.getItem(KEY)).resolves.toBeNull();
  });

  it('does not leave stale chunks behind when a shorter session replaces a longer one', async () => {
    const storage = createSecureSessionStorage();
    await storage.setItem(KEY, 'd'.repeat(3000));

    await storage.setItem(KEY, 'tiny');

    expect(backing().size).toBe(1);
    await expect(storage.getItem(KEY)).resolves.toBe('tiny');
  });
});
