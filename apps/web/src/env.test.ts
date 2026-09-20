import { describe, expect, it } from 'vitest';

import { MissingEnvError, readEnv } from './env.ts';

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
});
