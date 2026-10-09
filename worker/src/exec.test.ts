import assert from 'node:assert/strict';
import { test } from 'node:test';
import { untilAborted } from './exec.ts';

test('untilAborted enforces the limit even when the work ignores the signal', async () => {
  const never = new Promise<string>(() => {});
  const t0 = Date.now();
  await assert.rejects(untilAborted(never, AbortSignal.timeout(50), () => 'too slow'), /too slow/);
  assert.ok(Date.now() - t0 < 1000);
});

test('untilAborted passes results and errors through', async () => {
  assert.equal(await untilAborted(Promise.resolve(7), new AbortController().signal, () => 'x'), 7);
  await assert.rejects(untilAborted(Promise.reject(new Error('boom')), new AbortController().signal, () => 'x'), /boom/);
  const aborted = AbortSignal.abort();
  await assert.rejects(untilAborted(Promise.resolve(1), aborted, () => 'already'), /already/);
});
