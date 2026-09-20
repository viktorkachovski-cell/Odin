import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
// vitest/config re-exports Vite's defineConfig with the `test` block typed.
import { defineConfig } from 'vitest/config';

import { readEnv } from './src/env.ts';

export default defineConfig(({ command, mode }) => {
  // Vite substitutes client variables while building. Failing here prevents
  // Vercel from marking an unusable, configuration-error-only bundle Ready.
  if (command === 'build') readEnv(loadEnv(mode, '.', ''));

  return {
    plugins: [react()],
    build: { outDir: 'dist', sourcemap: false },
    test: {
      environment: 'jsdom',
      setupFiles: ['./vitest.setup.ts'],
      css: false,
    },
  };
});
