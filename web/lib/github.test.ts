import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { branchFromRef, repoUrlVariants, verifySignature } from './github.ts';

const sign = (secret: string, body: string) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

test('verifySignature accepts only the exact HMAC', () => {
  const body = '{"ref":"refs/heads/main"}';
  assert.ok(verifySignature('s3cret', body, sign('s3cret', body)));
  assert.ok(!verifySignature('s3cret', body, sign('other', body)));
  assert.ok(!verifySignature('s3cret', `${body} `, sign('s3cret', body)));
  assert.ok(!verifySignature('s3cret', body, 'sha256=short'), 'length mismatch must not throw');
  assert.ok(!verifySignature('s3cret', body, null));
  assert.ok(!verifySignature('', body, sign('', body)), 'an unset secret rejects everything');
});

test('repo URL variants and branch refs', () => {
  assert.deepEqual(repoUrlVariants('https://github.com/a/b.git', 'https://github.com/a/b'), [
    'https://github.com/a/b.git',
    'https://github.com/a/b',
    'https://github.com/a/b/',
  ]);
  assert.equal(branchFromRef('refs/heads/feature/x'), 'feature/x');
  assert.equal(branchFromRef('refs/tags/v1'), null);
});
