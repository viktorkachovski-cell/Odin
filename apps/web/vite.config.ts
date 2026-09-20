import react from '@vitejs/plugin-react';
import { loadEnv, type Plugin } from 'vite';
// vitest/config re-exports Vite's defineConfig with the `test` block typed.
import { defineConfig } from 'vitest/config';

import { readEnv } from './src/env.ts';

/**
 * Build logs are the only record of which backend an artifact targets, and the
 * artifact is opaque once built. The host is public; the publishable key is
 * never logged.
 */
function reportBuildTarget(supabaseUrl: string): Plugin {
  return {
    name: 'odin-build-target',
    apply: 'build',
    configResolved(config) {
      config.logger.info(`[odin] building against ${new URL(supabaseUrl).host}`);
    },
  };
}

export default defineConfig(({ command, mode }) => {
  // Vite substitutes client variables while building. Failing here prevents
  // Vercel from marking an unusable, configuration-error-only bundle Ready.
  const env = command === 'build' ? readEnv(loadEnv(mode, '.', '')) : null;

  return {
    plugins: [react(), ...(env === null ? [] : [reportBuildTarget(env.supabaseUrl)])],
    build: { outDir: 'dist', sourcemap: false },
    test: {
      environment: 'jsdom',
      setupFiles: ['./vitest.setup.ts'],
      css: false,
    },
  };
});
