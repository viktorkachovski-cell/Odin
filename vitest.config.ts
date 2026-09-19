import { defineConfig } from 'vitest/config';

/**
 * One runner for every workspace that has tests. Listing the projects
 * explicitly keeps a missing suite visible instead of silently skipping it.
 */
export default defineConfig({
  test: {
    projects: [
      'packages/contracts',
      'packages/domain',
      'packages/i18n',
      'packages/data',
      'apps/web',
    ],
  },
});
