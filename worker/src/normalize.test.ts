import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fingerprint, legacyFingerprint, normalize, normalizeLegacy, redactSecrets, toBugs } from './normalize.ts';
import type { RawFinding } from './types.ts';

test('normalize strips volatile parts but keeps quoted identifiers', () => {
  assert.equal(normalize(`  'foo' is   defined but never used at 12:4  `), "'foo' is defined but never used at N:N");
  assert.equal(normalize('Commit 3f9a2c1b broke "x"'), 'commit H broke "x"');
  assert.equal(normalize(`Expected "hello world" got 'it failed!'`), 'expected S got S', 'values are masked');
  assert.equal(normalize("Property 'user.id' missing"), "property 'user.id' missing");
  assert.equal(normalizeLegacy(`'foo' is defined at 12`), 'S is defined at N', 'v1 rule unchanged');
  assert.equal(normalize('lodash@4.17.15 has 6 vulnerabilities'), 'lodash@N.N.N has N vulnerabilities');
});

test('fingerprint ignores line numbers and values but not identifiers, file or rule', () => {
  const base = { category: 'logic' as const, rule: 'no-unused-vars', file: 'a.js', message: "'x' is unused" };
  assert.notEqual(fingerprint(base), fingerprint({ ...base, message: "'y' is unused" }), 'two variables, two bugs');
  assert.equal(fingerprint(base), fingerprint({ ...base, message: "'x'   is unused" }));
  const value = { ...base, message: 'Expected "a b" to equal "c d"' };
  assert.equal(fingerprint(value), fingerprint({ ...value, message: 'Expected "e f" to equal "g h"' }));
  assert.notEqual(fingerprint(base), fingerprint({ ...base, file: 'b.js' }));
  assert.notEqual(fingerprint(base), fingerprint({ ...base, rule: 'no-undef' }));
});

test('toBugs dedupes in-batch and applies default severity', () => {
  const f: RawFinding = { tester: 'eslint', rule: 'r', category: 'security', message: "bad 'a value'", file: 'x.js', line: 1 };
  const rows = toBugs([f, { ...f, line: 9, message: "bad 'other value'" }, { ...f, file: 'y.js' }], 'p', 7);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.severity, 'high');
  assert.equal(rows[0]!.first_seen_run, 7);
  assert.equal(rows[0]!.line, 1, 'first occurrence wins');
});

test('redactSecrets removes tokens and assigned secrets', () => {
  const s = redactSecrets(`const t = 'ghp_FAKEfakeFAKEfake0123456789abcdefABCD';\napiKey: "abcd1234efgh5678"\nAKIAABCDEFGHIJKLMNOP`);
  assert.ok(!s.includes('ghp_FAKE'));
  assert.ok(!s.includes('abcd1234efgh5678'));
  assert.ok(!s.includes('AKIAABCDEFGHIJKLMNOP'));
  assert.ok(s.includes('apiKey: "[REDACTED]"'));
});

test('toBugs redacts secrets in snippets', () => {
  const rows = toBugs(
    [{ tester: 'semgrep', rule: 'r', category: 'security', message: 'm', evidence: { snippet: 'token = "ghp_FAKEfakeFAKEfake0123456789abcdefABCD"' } }],
    'p',
    1,
  );
  assert.ok(!JSON.stringify(rows[0]!.evidence).includes('ghp_'));
});

test('legacy fingerprint equals v2 when nothing identifier-like is quoted', () => {
  const plain = { category: 'type' as const, rule: 'TS2345', file: 'a.ts', message: 'Argument of type S is wrong at 6' };
  assert.equal(fingerprint(plain), legacyFingerprint(plain));
  const named = { ...plain, message: "'totl' is not defined" };
  assert.notEqual(fingerprint(named), legacyFingerprint(named));
  const rows = toBugs([{ tester: 'eslint', ...named }], 'p', 1);
  assert.equal(rows[0]!.legacy_fingerprint, legacyFingerprint(named));
});
