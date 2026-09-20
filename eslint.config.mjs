import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const source = ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'];

export default tseslint.config(
  // A config object containing ONLY `ignores` is a global ignore. Combining it
  // with another key (as this block previously did with `linterOptions`) turns
  // it into a per-object filter, which let build output and generated types
  // reach the linter.
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.expo/**',
      '**/.vercel/**',
      '**/.tmp/**',
      '**/database.generated.ts',
    ],
  },
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: { globals: globals.node },
  },
  {
    files: source,
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    extends: [tseslint.configs.recommendedTypeChecked],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      complexity: ['error', 15],
      'max-depth': ['error', 4],
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['apps/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@supabase/supabase-js', '**/packages/data/src/**'],
              message: 'Use the public @odin/data API; screens must not query Supabase directly.',
            },
          ],
        },
      ],
    },
  },
  {
    // Metro and Babel load these synchronously through CommonJS before any
    // bundler transform runs, so they cannot use ESM import syntax.
    files: ['apps/mobile/metro.config.js', 'apps/mobile/babel.config.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'jsx-a11y': jsxA11y },
    rules: jsxA11y.configs.recommended.rules,
  },
  {
    files: ['packages/domain/**/*.{ts,tsx}', 'packages/contracts/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react/*',
                'react-native',
                'expo*',
                '@supabase/*',
                '@odin/data',
                '@odin/data/*',
                '**/apps/**',
              ],
              message: 'Domain/contracts must remain platform and transport independent.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
