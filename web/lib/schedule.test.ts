import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextScheduledRun } from './schedule.ts';

test('off has no next run', () => {
  assert.equal(nextScheduledRun('off'), null);
});

test('hourly runs at :07 of this hour when not yet passed', () => {
  const next = nextScheduledRun('hourly', new Date('2026-10-07T10:05:30Z'));
  assert.equal(next?.toISOString(), '2026-10-07T10:07:00.000Z');
});

test('hourly rolls to next hour once :07 has passed', () => {
  const next = nextScheduledRun('hourly', new Date('2026-10-07T10:07:00Z'));
  assert.equal(next?.toISOString(), '2026-10-07T11:07:00.000Z');
});

test('nightly runs at 02:13 UTC today or tomorrow', () => {
  assert.equal(
    nextScheduledRun('nightly', new Date('2026-10-07T01:00:00Z'))?.toISOString(),
    '2026-10-07T02:13:00.000Z',
  );
  assert.equal(
    nextScheduledRun('nightly', new Date('2026-10-07T02:13:00Z'))?.toISOString(),
    '2026-10-08T02:13:00.000Z',
  );
});

test('nightly crosses month boundaries', () => {
  const next = nextScheduledRun('nightly', new Date('2026-10-31T23:00:00Z'));
  assert.equal(next?.toISOString(), '2026-11-01T02:13:00.000Z');
});
