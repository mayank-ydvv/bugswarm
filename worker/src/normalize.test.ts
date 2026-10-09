import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fingerprint, normalize, redactSecrets, toBugs } from './normalize.ts';
import type { RawFinding } from './types.ts';

test('normalize strips volatile parts', () => {
  assert.equal(normalize(`  'foo' is   defined but never used at 12:4  `), 'S is defined but never used at N:N');
  assert.equal(normalize('Commit 3f9a2c1b broke "x"'), 'commit H broke S');
  assert.equal(normalize('lodash@4.17.15 has 6 vulnerabilities'), 'lodash@N.N.N has N vulnerabilities');
});

test('fingerprint ignores line numbers and quoted names but not file or rule', () => {
  const base = { category: 'logic' as const, rule: 'no-unused-vars', file: 'a.js', message: "'x' is unused" };
  assert.equal(fingerprint(base), fingerprint({ ...base, message: "'y' is unused" }));
  assert.notEqual(fingerprint(base), fingerprint({ ...base, file: 'b.js' }));
  assert.notEqual(fingerprint(base), fingerprint({ ...base, rule: 'no-undef' }));
});

test('toBugs dedupes in-batch and applies default severity', () => {
  const f: RawFinding = { tester: 'eslint', rule: 'r', category: 'security', message: "bad 'a'", file: 'x.js', line: 1 };
  const rows = toBugs([f, { ...f, line: 9, message: "bad 'b'" }, { ...f, file: 'y.js' }], 'p', 7);
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
