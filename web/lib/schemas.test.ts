import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ProjectInput, RunRequest, safeNextPath } from './schemas.ts';

test('project needs a repo or live URL', () => {
  const r = ProjectInput.safeParse({ name: 'x', repo_url: '', live_url: '' });
  assert.equal(r.success, false);
});

test('project applies defaults and blanks become null', () => {
  const r = ProjectInput.parse({ name: 'x', repo_url: 'https://github.com/a/b', live_url: '' });
  assert.deepEqual(r, {
    name: 'x',
    repo_url: 'https://github.com/a/b',
    branch: 'main',
    live_url: null,
    start_cmd: 'npm run dev',
    port: 3000,
    schedule: 'nightly',
  });
});

test('project rejects non-http URLs and bad branches', () => {
  assert.equal(ProjectInput.safeParse({ name: 'x', repo_url: 'file:///etc', live_url: '' }).success, false);
  assert.equal(
    ProjectInput.safeParse({ name: 'x', repo_url: 'https://g.com/a', live_url: '', branch: '-rf' }).success,
    false,
  );
});

test('run request validates uuid and defaults full=false', () => {
  assert.equal(RunRequest.safeParse({ projectId: 'nope' }).success, false);
  const r = RunRequest.parse({ projectId: 'b7480b4b-bcdf-499f-9f7f-00a9ff543866' });
  assert.equal(r.full, false);
});

test('safeNextPath blocks open redirects', () => {
  assert.equal(safeNextPath('//evil.com'), '/w');
  assert.equal(safeNextPath('https://evil.com'), '/w');
  assert.equal(safeNextPath('/\\evil.com'), '/w');
  assert.equal(safeNextPath('/w/abc'), '/w/abc');
  assert.equal(safeNextPath(null), '/w');
});
