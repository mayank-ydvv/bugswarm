import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { mapViolations } from './axe.ts';
import { mapLighthouse } from './lighthouse.ts';
import { reviewFindings } from './review.ts';
import { directImports, isSource } from './source.ts';
import { detectRunner, isLoadFailure, parseJestJson, parseTap } from './testgen.ts';

const TAP = `TAP version 13
# Subtest: cartTotal sums
not ok 1 - cartTotal sums
  ---
  duration_ms: 0.6
  location: '/app/.bugswarm-tests/0-cart.test.mjs:4:1'
  failureType: 'testCodeFailure'
  error: 'totl is not defined'
  code: 'ERR_TEST_FAILURE'
  name: 'ReferenceError'
  ...
# Subtest: equality
not ok 2 - equality
  ---
  location: '/app/.bugswarm-tests/0-cart.test.mjs:7:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:

    5 !== 6
  name: 'AssertionError'
  ...
ok 3 - passes
  ---
  duration_ms: 0.1
  ...
1..3`;

test('parseTap extracts failing tests with their errors', () => {
  const f = parseTap(TAP);
  assert.equal(f.length, 2);
  assert.deepEqual([f[0]!.name, f[0]!.error, f[0]!.file], ['cartTotal sums', 'ReferenceError: totl is not defined', '/app/.bugswarm-tests/0-cart.test.mjs']);
  assert.equal(f[1]!.error, 'Expected values to be strictly equal: 5 !== 6');
});

test('parseTap skips parents of failing subtests', () => {
  const nested = `not ok 1 - suite\n  ---\n  failureType: 'subtestsFailed'\n  error: '1 subtest failed'\n  ...`;
  assert.equal(parseTap(nested).length, 0);
});

test('parseJestJson reads vitest/jest reports', () => {
  const out = `noise\n${JSON.stringify({ testResults: [{ name: '/app/.bugswarm-tests/0-a.test.ts', assertionResults: [{ fullName: 'a works', status: 'failed', failureMessages: ['AssertionError: expected 1 to be 2\n at x'] }, { fullName: 'b', status: 'passed' }] }] })}`;
  const f = parseJestJson(out);
  assert.deepEqual(f.map((x) => [x.name, x.error]), [['a works', 'AssertionError: expected 1 to be 2']]);
});

test('detectRunner prefers vitest, then jest, then node:test', () => {
  assert.equal(detectRunner({ devDependencies: { vitest: '1', jest: '1' } }), 'vitest');
  assert.equal(detectRunner({ dependencies: { jest: '1' } }), 'jest');
  assert.equal(detectRunner({}), 'node');
});

test('directImports resolves relative imports to real source files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bs-src-'));
  mkdirSync(join(dir, 'src/lib'), { recursive: true });
  for (const f of ['src/a.ts', 'src/lib/b.ts', 'src/lib/index.ts', 'src/c.js']) writeFileSync(join(dir, f), '');
  const content = `import { b } from './lib/b.js';\nimport x from './lib';\nconst c = require('./c');\nimport React from 'react';\nimport y from '../../outside';`;
  assert.deepEqual(directImports(dir, 'src/a.ts', content).sort(), ['src/c.js', 'src/lib/b.ts', 'src/lib/index.ts']);
});

test('isSource excludes tests, builds and declarations', () => {
  assert.ok(isSource('src/cart.js'));
  for (const f of ['src/cart.test.js', 'tests/a.js', 'dist/a.js', 'a.d.ts', 'vendor/x.js', 'a.min.js', 'README.md']) {
    assert.ok(!isSource(f), f);
  }
});

test('lighthouse reports low scores and poor audits only', () => {
  const f = mapLighthouse(
    {
      categories: { performance: { score: 0.34 } },
      audits: {
        'largest-contentful-paint': { score: 0.2, displayValue: '5.1 s' },
        'cumulative-layout-shift': { score: 0.95 },
        'render-blocking-resources': { score: 0, details: { items: [{ url: 'http://x/app.css' }] } },
      },
    },
    '/',
    '/',
  );
  assert.deepEqual(f.map((x) => x.rule), ['lighthouse:performance', 'lighthouse:largest-contentful-paint', 'lighthouse:render-blocking-resources']);
  assert.equal(f[0]!.message, 'Page / scores 34/100 for performance (Lighthouse, mobile)');
});

test('axe keeps serious/critical violations, one per rule per page', () => {
  const f = mapViolations(
    [
      { id: 'image-alt', impact: 'critical', help: 'Images must have alternative text', helpUrl: 'u', nodes: [{ target: ['img'] }] },
      { id: 'region', impact: 'moderate', help: 'x', helpUrl: 'u', nodes: [] },
    ],
    '/about',
    '/about',
  );
  assert.equal(f.length, 1);
  assert.equal(f[0]!.message, 'Images must have alternative text (image-alt) on /about');
});

test('review findings are capped and carry the file', () => {
  const f = reviewFindings('src/a.js', { findings: Array.from({ length: 8 }, (_, i) => ({ line: i + 1, title: `t${i}`, explanation: 'e' })) }, '/none');
  assert.equal(f.length, 5);
  assert.equal(f[0]!.file, 'src/a.js');
  assert.equal(f[0]!.rule, 'ai-review');
});

test('a test file that crashes while loading is not reported as a bug', () => {
  const [f] = parseTap(
    [
      "not ok 1 - /app/.bugswarm-tests/1-App.test.mjs",
      '  ---',
      '  duration_ms: 251.6',
      "  location: '/app/.bugswarm-tests/1-App.test.mjs:1:1'",
      "  failureType: 'testCodeFailure'",
      "  error: 'test failed'",
      "  code: 'ERR_TEST_FAILURE'",
      '  ...',
    ].join('\n'),
  );
  assert.ok(f);
  assert.equal(isLoadFailure(f, '.bugswarm-tests/1-App.test.mjs'), true);
  assert.equal(
    isLoadFailure({ file: f.file, name: 'adds two numbers', error: 'Expected values to be strictly equal', log: '' }, '.bugswarm-tests/1-App.test.mjs'),
    false,
  );
});
