import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapEslint } from './eslint.ts';
import { mapGitleaks } from './gitleaks.ts';
import { mapOsv } from './osv.ts';
import { mapSemgrep } from './semgrep.ts';
import { parseTsc } from './tsc.ts';

const DIR = '/nonexistent';

test('tsc output parsing with continuation lines', () => {
  const out = [
    "/app/src/price.ts(6,37): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.",
    "  Type 'string' is not assignable.",
    'src/b.ts(1,1): error TS1005: ";" expected.',
  ].join('\n');
  const f = parseTsc(out, DIR);
  assert.equal(f.length, 2);
  assert.deepEqual([f[0]!.file, f[0]!.line, f[0]!.rule, f[0]!.category], ['src/price.ts', 6, 'TS2345', 'type']);
  assert.match(f[0]!.evidence!.log!, /Type 'string'/);
  assert.equal(f[1]!.file, 'src/b.ts');
});

test('eslint keeps errors and fatal messages, drops warnings', () => {
  const f = mapEslint(
    [
      {
        filePath: '/app/src/cart.js',
        messages: [
          { ruleId: 'no-unused-vars', severity: 2, message: "'discount' is assigned a value but never used.", line: 2 },
          { ruleId: 'semi', severity: 1, message: 'Missing semicolon.', line: 3 },
          { ruleId: null, severity: 2, message: 'Parsing error: Unexpected token', line: 4, fatal: true },
        ],
      },
    ],
    DIR,
  );
  assert.deepEqual(f.map((x) => x.rule), ['no-unused-vars', 'parse-error']);
  assert.equal(f[0]!.file, 'src/cart.js');
});

test('gitleaks never keeps the secret', () => {
  const f = mapGitleaks([
    { RuleID: 'github-pat', Description: 'GitHub PAT', File: '/repo/src/config.js', StartLine: 2, Secret: 'ghp_x', Match: 'ghp_x' } as never,
  ]);
  assert.equal(f[0]!.file, 'src/config.js');
  assert.equal(f[0]!.evidence, undefined);
  assert.ok(!JSON.stringify(f).includes('ghp_x'));
});

test('osv gives one finding per vulnerable package', () => {
  const f = mapOsv({
    results: [
      {
        source: { path: '/src/package-lock.json' },
        packages: [
          {
            package: { name: 'lodash', version: '4.17.15', ecosystem: 'npm' },
            vulnerabilities: [{ id: 'GHSA-1', summary: 'Prototype pollution', aliases: ['CVE-2020-1'] }, { id: 'GHSA-2' }],
            groups: [{ ids: ['GHSA-1'], max_severity: '7.4' }, { ids: ['GHSA-2'], max_severity: '5.3' }],
          },
          { package: { name: 'ok', version: '1.0.0', ecosystem: 'npm' }, vulnerabilities: [] },
        ],
      },
    ],
  });
  assert.equal(f.length, 1);
  assert.equal(f[0]!.message, 'lodash@4.17.15 has 2 known vulnerabilities (max CVSS 7.4)');
  assert.equal(f[0]!.file, 'package-lock.json');
  assert.equal(f[0]!.severity, 'high');
  assert.match(f[0]!.evidence!.log!, /CVE-2020-1/);
});

test('semgrep drops snippets for secret rules', () => {
  const f = mapSemgrep(
    [
      { check_id: 'generic.secrets.security.detected-github-token', path: 'src/config.js', start: { line: 2 }, extra: { message: 'GitHub Token detected' } },
      { check_id: 'javascript.browser.security.eval-detected', path: 'server.js', start: { line: 14 }, extra: { message: 'eval' } },
    ],
    DIR,
  );
  assert.equal(f[0]!.evidence!.snippet, undefined);
  assert.equal(f[1]!.category, 'security');
});
