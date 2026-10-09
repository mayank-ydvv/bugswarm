import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bugLocation, combinePrompts, compareBugs, DEFAULT_FILTERS, githubBlobUrl, matchesFilters, sanitizeSearch, statusText, type BugListRow } from './bugs.ts';

const bug = (o: Partial<BugListRow>): BugListRow => ({
  id: 1,
  title: 'Crash on save',
  severity: 'high',
  category: 'logic',
  tester: 'eslint',
  file: 'src/cart.js',
  line: 3,
  url: null,
  status: 'open',
  created_at: '',
  verified_run: null,
  ...o,
});

test('sanitizeSearch strips PostgREST syntax', () => {
  assert.equal(sanitizeSearch(' a,b(c)*d% '), 'a b c d');
});

test('matchesFilters mirrors the query', () => {
  assert.ok(matchesFilters(bug({}), DEFAULT_FILTERS));
  assert.ok(!matchesFilters(bug({ status: 'fixed' }), DEFAULT_FILTERS));
  assert.ok(matchesFilters(bug({}), { ...DEFAULT_FILTERS, q: 'CART' }));
  assert.ok(!matchesFilters(bug({}), { ...DEFAULT_FILTERS, q: 'nope' }));
  assert.ok(!matchesFilters(bug({}), { ...DEFAULT_FILTERS, severity: ['critical'] }));
});

test('compareBugs: severity rank, then newest', () => {
  const rows = [bug({ id: 1, severity: 'low' }), bug({ id: 2, severity: 'critical' }), bug({ id: 3, severity: 'critical' })];
  assert.deepEqual(rows.sort(compareBugs).map((r) => r.id), [3, 2, 1]);
});

test('locations and GitHub links', () => {
  assert.equal(bugLocation({ file: null, line: null, url: '/missing-page' }), '/missing-page');
  assert.equal(bugLocation({ file: null, line: null, url: 'https://x.com/a?b=1' }), '/a?b=1');
  assert.equal(
    githubBlobUrl('https://github.com/acme/app.git', 'abc', 'src/a b.ts', 4),
    'https://github.com/acme/app/blob/abc/src/a%20b.ts#L4',
  );
  assert.equal(githubBlobUrl('file:///tmp/x', 'abc', 'a.ts', 1), null);
});

test('combined prompt and verified label', () => {
  assert.equal(combinePrompts(['A', 'B']), 'Fix these 2 bugs one by one.\n\n---\n\nA\n\n---\n\nB');
  assert.equal(statusText({ status: 'verified', verified_run: 52 }), 'Fixed ✓ verified by run #52');
  assert.equal(statusText({ status: 'in_progress', verified_run: null }), 'In progress');
});
