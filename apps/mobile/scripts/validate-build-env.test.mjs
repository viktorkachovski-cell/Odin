import assert from 'node:assert/strict';
import test from 'node:test';

import { validateBuildEnv } from './validate-build-env.mjs';

const validEnvironment = {
  EXPO_PUBLIC_SUPABASE_URL: 'https://mvltbhtsukorspmpyhpw.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example',
};

test('accepts the hosted Odin project and a publishable key', () => {
  assert.doesNotThrow(() => validateBuildEnv(validEnvironment));
});

test('rejects missing values without exposing configuration values', () => {
  assert.throws(
    () => validateBuildEnv({}),
    /EXPO_PUBLIC_SUPABASE_URL is missing[\s\S]*EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing/,
  );
});

test('rejects a different Supabase project', () => {
  assert.throws(
    () =>
      validateBuildEnv({
        ...validEnvironment,
        EXPO_PUBLIC_SUPABASE_URL: 'https://another-project.supabase.co',
      }),
    /does not target the hosted Odin project/,
  );
});

test('rejects a secret or legacy key', () => {
  assert.throws(
    () =>
      validateBuildEnv({
        ...validEnvironment,
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'not-a-publishable-key',
      }),
    /not a modern publishable key/,
  );
});
