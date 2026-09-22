import { pathToFileURL } from 'node:url';

const EXPECTED_SUPABASE_HOST = 'mvltbhtsukorspmpyhpw.supabase.co';

export function validateBuildEnv(source) {
  const urlValue = (source.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
  const keyValue = (source.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  const errors = [];

  if (urlValue.length === 0) {
    errors.push('EXPO_PUBLIC_SUPABASE_URL is missing');
  } else {
    try {
      const url = new URL(urlValue);
      if (url.protocol !== 'https:' || url.hostname !== EXPECTED_SUPABASE_HOST) {
        errors.push('EXPO_PUBLIC_SUPABASE_URL does not target the hosted Odin project over HTTPS');
      }
    } catch {
      errors.push('EXPO_PUBLIC_SUPABASE_URL is not an absolute URL');
    }
  }

  if (keyValue.length === 0) {
    errors.push('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing');
  } else if (!keyValue.startsWith('sb_publishable_')) {
    errors.push('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not a modern publishable key');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid mobile build environment:\n- ${errors.join('\n- ')}`);
  }
}

function main() {
  try {
    validateBuildEnv(process.env);
    console.log('Mobile build environment is configured for the hosted Odin project.');
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Invalid mobile build environment.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
