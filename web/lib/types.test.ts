import assert from 'node:assert/strict';
import { test } from 'node:test';
import { healthScore } from './types.ts';

test('health score weights severities and floors at 0', () => {
  assert.equal(healthScore({}), 100);
  assert.equal(healthScore({ critical: 1, high: 2, medium: 3, low: 50 }), 100 - 10 - 8 - 3);
  assert.equal(healthScore({ critical: 20 }), 0);
});
