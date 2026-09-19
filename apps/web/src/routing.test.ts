import { describe, expect, it } from 'vitest';

import { captureInviteToken, safeInternalPath } from './routing.ts';

describe('safeInternalPath', () => {
  it('keeps a genuine internal destination', () => {
    expect(safeInternalPath('/lists/abc')).toBe('/lists/abc');
    expect(safeInternalPath('/my-tasks?filter=open')).toBe('/my-tasks?filter=open');
  });

  it('refuses absolute and protocol-relative URLs', () => {
    expect(safeInternalPath('https://evil.example/steal')).toBe('/');
    expect(safeInternalPath('//evil.example/steal')).toBe('/');
    expect(safeInternalPath('http://evil.example')).toBe('/');
  });

  it('refuses backslash and scheme tricks browsers may normalise', () => {
    expect(safeInternalPath('/\\evil.example')).toBe('/');
    expect(safeInternalPath('/redirect:javascript')).toBe('/');
    expect(safeInternalPath('javascript:alert(1)')).toBe('/');
  });

  it('refuses control characters and empty input', () => {
    expect(safeInternalPath('/ok\u0000/evil')).toBe('/');
    expect(safeInternalPath('   ')).toBe('/');
    expect(safeInternalPath(null)).toBe('/');
  });
});

describe('captureInviteToken', () => {
  function fakeLocation(hash: string): Location {
    return { hash, pathname: '/invite', search: '' } as Location;
  }

  it('reads the token from the fragment and clears it from history', () => {
    let replaced: string | null = null;
    const history = {
      replaceState: (_s: unknown, _t: string, url: string) => {
        replaced = url;
      },
    } as unknown as History;

    expect(captureInviteToken(fakeLocation('#token=abc123'), history)).toBe('abc123');
    // The token must not remain in the visible URL.
    expect(replaced).toBe('/invite');
  });

  it('accepts a bare fragment token', () => {
    const history = { replaceState: () => undefined } as unknown as History;
    expect(captureInviteToken(fakeLocation('#rawtoken'), history)).toBe('rawtoken');
  });

  it('returns null when there is no fragment', () => {
    const history = { replaceState: () => undefined } as unknown as History;
    expect(captureInviteToken(fakeLocation(''), history)).toBeNull();
  });
});
