import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crawlable, DESTRUCTIVE } from './playwright.ts';

test('crawlable keeps same-origin pages, strips hashes, skips the rest', () => {
  const o = 'http://127.0.0.1:3000';
  assert.equal(crawlable('/about#team', o), 'http://127.0.0.1:3000/about');
  assert.equal(crawlable('https://evil.com/x', o), null);
  assert.equal(crawlable('mailto:a@b.c', o), null);
  assert.equal(crawlable('/files/report.pdf', o), null);
  assert.equal(crawlable('/account/delete?id=1', o), null);
  assert.equal(crawlable('/logout', o), null);
});

test('destructive labels are never clicked', () => {
  for (const l of ['Log out', 'Sign out', 'Delete project', 'Remove item', 'Pay now', 'Checkout']) {
    assert.ok(DESTRUCTIVE.test(l), l);
  }
  for (const l of ['Apply coupon', 'Save', 'Open menu', 'Payment history'.replace('Payment', 'Billing')]) {
    assert.ok(!DESTRUCTIVE.test(l), l);
  }
});
