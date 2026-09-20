import { InvalidEnvError, MissingEnvError, readEnv } from './env.ts';

describe('mobile environment', () => {
  it('returns trimmed public Supabase configuration', () => {
    expect(
      readEnv({
        EXPO_PUBLIC_SUPABASE_URL: '  https://example.supabase.co  ',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '  sb_publishable_example  ',
      }),
    ).toEqual({
      supabaseUrl: 'https://example.supabase.co',
      supabasePublishableKey: 'sb_publishable_example',
    });
  });

  it('reports every absent client variable', () => {
    expect(() => readEnv({})).toThrowError(
      new MissingEnvError(['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY']),
    );
  });

  it('treats whitespace-only values as missing', () => {
    expect(() =>
      readEnv({
        EXPO_PUBLIC_SUPABASE_URL: '   ',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
      }),
    ).toThrowError(new MissingEnvError(['EXPO_PUBLIC_SUPABASE_URL']));
  });

  it('normalises a configured trailing slash away', () => {
    expect(
      readEnv({
        EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co/',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'k',
      }).supabaseUrl,
    ).toBe('https://example.supabase.co');
  });

  it('rejects a present but malformed URL rather than shipping a broken build', () => {
    expect(() =>
      readEnv({
        EXPO_PUBLIC_SUPABASE_URL: 'example.supabase.co',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'k',
      }),
    ).toThrowError(new InvalidEnvError('EXPO_PUBLIC_SUPABASE_URL', 'expected an absolute URL'));
  });

  it('refuses plaintext against a remote host', () => {
    expect(() =>
      readEnv({
        EXPO_PUBLIC_SUPABASE_URL: 'http://example.supabase.co',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'k',
      }),
    ).toThrowError(
      new InvalidEnvError('EXPO_PUBLIC_SUPABASE_URL', 'expected https, or http on localhost'),
    );
  });

  it('allows plaintext against the emulator route to a local stack', () => {
    expect(
      readEnv({
        EXPO_PUBLIC_SUPABASE_URL: 'http://10.0.2.2:54321',
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'k',
      }).supabaseUrl,
    ).toBe('http://10.0.2.2:54321');
  });
});
