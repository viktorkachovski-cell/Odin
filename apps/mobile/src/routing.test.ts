import { safeAuthDestination, safeInternalPath, tokenFromDeepLink } from './routing.ts';

describe('safeInternalPath', () => {
  it('keeps an ordinary in-app destination', () => {
    expect(safeInternalPath('/list/abc')).toBe('/list/abc');
  });

  it.each([
    ['//evil.example', 'protocol-relative'],
    ['https://evil.example', 'absolute URL'],
    ['/ok\\..\\evil', 'backslash'],
    ['javascript:alert(1)', 'scheme'],
    ['/ok\u0000/evil', 'control character'],
    ['relative', 'not absolute'],
  ])('refuses %s (%s) and falls back to Home', (candidate) => {
    expect(safeInternalPath(candidate)).toBe('/');
  });

  it('falls back to Home when no destination was supplied', () => {
    expect(safeInternalPath(undefined)).toBe('/');
    expect(safeInternalPath(null)).toBe('/');
  });
});

describe('safeAuthDestination', () => {
  it('keeps a genuine destination so a deep link still lands where it meant to', () => {
    expect(safeAuthDestination('/invite')).toBe('/invite');
    expect(safeAuthDestination('/list/abc?filter=mine')).toBe('/list/abc?filter=mine');
  });

  it.each([
    ['/sign-in', 'the form just completed'],
    ['/SIGN-IN/', 'a differently cased and trailing-slashed variant'],
    ['/register', 'registration'],
    ['/forgot-password', 'recovery request'],
    ['/reset-password', 'the browser reset page'],
    ['/verify-code', 'the retired code screen'],
    ['/%73ign-in', 'a percent-encoded spelling'],
  ])('refuses %s (%s) so login cannot loop', (candidate) => {
    expect(safeAuthDestination(candidate)).toBe('/');
  });

  it('still rejects everything an unsafe path rejects', () => {
    expect(safeAuthDestination('//evil.example')).toBe('/');
    expect(safeAuthDestination('https://evil.example')).toBe('/');
    expect(safeAuthDestination('/bad%ZZ')).toBe('/');
    expect(safeAuthDestination(undefined)).toBe('/');
  });
});

describe('tokenFromDeepLink', () => {
  it('reads the token out of the link fragment', () => {
    expect(tokenFromDeepLink('odin://invite#token=abc123')).toBe('abc123');
  });

  it('ignores a token placed in the query string', () => {
    // The contract keeps tokens out of request paths; honouring a query
    // parameter here would quietly undo that.
    expect(tokenFromDeepLink('odin://invite?token=abc123')).toBeNull();
  });

  it('returns null for a link without a token', () => {
    expect(tokenFromDeepLink('odin://invite')).toBeNull();
    expect(tokenFromDeepLink('odin://invite#other=1')).toBeNull();
    expect(tokenFromDeepLink('odin://invite#token=')).toBeNull();
    expect(tokenFromDeepLink(null)).toBeNull();
  });
});
