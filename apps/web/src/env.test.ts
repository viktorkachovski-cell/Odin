import { describe, expect, it } from 'vitest';

import { InvalidEnvError, MissingEnvError, readEnv } from './env.ts';

function source(values: Record<string, string>): ImportMetaEnv {
  return values as ImportMetaEnv;
}

describe('web environment', () => {
  it('returns trimmed public Supabase configuration', () => {
    expect(
      readEnv(
        source({
          VITE_SUPABASE_URL: '  https://example.supabase.co  ',
          VITE_SUPABASE_PUBLISHABLE_KEY: '  sb_publishable_example  ',
        }),
      ),
    ).toEqual({
      supabaseUrl: 'https://example.supabase.co',
      supabasePublishableKey: 'sb_publishable_example',
    });
  });

  it('reports every absent client variable', () => {
    expect(() => readEnv(source({}))).toThrowError(
      new MissingEnvError(['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']),
    );
  });

  it('treats whitespace-only values as missing', () => {
    expect(() =>
      readEnv(
        source({
          VITE_SUPABASE_URL: '   ',
          VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
        }),
      ),
    ).toThrowError(new MissingEnvError(['VITE_SUPABASE_URL']));
  });

  it('normalises a configured trailing slash away so request paths stay single-separated', () => {
    expect(
      readEnv(
        source({
          VITE_SUPABASE_URL: 'https://example.supabase.co/',
          VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
        }),
      ).supabaseUrl,
    ).toBe('https://example.supabase.co');
  });

  it('rejects a present but malformed URL rather than building an unusable bundle', () => {
    expect(() =>
      readEnv(
        source({
          VITE_SUPABASE_URL: 'example.supabase.co',
          VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
        }),
      ),
    ).toThrowError(new InvalidEnvError('VITE_SUPABASE_URL', 'expected an absolute URL'));
  });

  it('refuses plaintext against a remote host', () => {
    expect(() =>
      readEnv(
        source({
          VITE_SUPABASE_URL: 'http://example.supabase.co',
          VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
        }),
      ),
    ).toThrowError(
      new InvalidEnvError('VITE_SUPABASE_URL', 'expected https, or http on localhost'),
    );
  });

  it('allows plaintext against the local development stack', () => {
    expect(
      readEnv(
        source({
          VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
          VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
        }),
      ).supabaseUrl,
    ).toBe('http://127.0.0.1:54321');
  });
});
