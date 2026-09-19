import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { ESLint } from 'eslint';

test('lint enforces typed safety, layer boundaries, hooks and web accessibility', async () => {
  const fixtureRoot = path.resolve('apps');
  await mkdir(fixtureRoot, { recursive: true });
  const fixture = await mkdtemp(path.join(fixtureRoot, 'odin-lint-fixture-'));
  try {
    await writeFile(
      path.join(fixture, 'tsconfig.json'),
      JSON.stringify({
        extends: '../../tsconfig.base.json',
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          jsx: 'react-jsx',
        },
        include: ['**/*.ts', '**/*.tsx'],
      }),
    );
    const bad = path.join(fixture, 'bad.ts');
    await writeFile(bad, 'export const unsafe: any = 1;\nPromise.resolve(unsafe);\n');
    const good = path.join(fixture, 'good.ts');
    await writeFile(good, 'export const title: string = "Odin";\n');
    const eslint = new ESLint();
    const [badResult] = await eslint.lintFiles([bad]);
    const ruleIds = badResult.messages.map((m) => m.ruleId);
    assert.ok(ruleIds.includes('@typescript-eslint/no-explicit-any'));
    assert.ok(ruleIds.includes('@typescript-eslint/no-floating-promises'));
    const [goodResult] = await eslint.lintFiles([good]);
    assert.equal(goodResult.errorCount, 0, JSON.stringify(goodResult.messages));
    const webConfig = await eslint.calculateConfigForFile('apps/web/src/Screen.tsx');
    assert.equal(webConfig.rules['jsx-a11y/alt-text'][0], 2);
    assert.equal(webConfig.rules['react-hooks/rules-of-hooks'][0], 2);
    assert.equal(webConfig.rules['no-restricted-imports'][0], 2);
    const domainConfig = await eslint.calculateConfigForFile('packages/domain/src/task.ts');
    assert.match(JSON.stringify(domainConfig.rules['no-restricted-imports']), /@supabase/);
    const mobileConfig = await eslint.calculateConfigForFile('apps/mobile/src/Screen.tsx');
    assert.equal(mobileConfig.rules['jsx-a11y/alt-text'], undefined);
  } finally {
    assert.equal(path.dirname(fixture), fixtureRoot);
    assert.ok(path.basename(fixture).startsWith('odin-lint-fixture-'));
    await rm(fixture, { recursive: true, force: true });
  }
});
