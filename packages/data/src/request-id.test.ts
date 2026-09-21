import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureRequestIdGenerator, newRequestId } from './request-id.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  configureRequestIdGenerator(() => globalThis.crypto.randomUUID());
});

describe('request IDs', () => {
  it('uses browser crypto by default', () => {
    expect(newRequestId()).toMatch(/^[0-9a-f-]{36}$/);
  });
  it('uses the native adapter without requiring browser crypto', () => {
    vi.stubGlobal('crypto', undefined);
    const native = vi.fn(() => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    configureRequestIdGenerator(native);
    expect(newRequestId()).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(native).toHaveBeenCalledTimes(1);
  });
});
