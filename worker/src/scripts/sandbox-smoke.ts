/**
 * Manual check of the live-app sandbox: starts a project's app on the internal network, waits for it,
 * fetches it through baseUrl and proves the app container cannot reach the internet.
 * Usage: node --env-file=../.env src/scripts/sandbox-smoke.ts <projectId>
 */
import { loadConfig } from '../config.ts';
import { connect } from '../db.ts';
import { run } from '../exec.ts';
import { openSandbox } from '../sandbox.ts';
import type { ProjectRow } from '../types.ts';

const projectId = process.argv[2];
if (!projectId) throw new Error('usage: sandbox-smoke.ts <projectId>');

const config = loadConfig();
const sql = connect(config.DATABASE_URL, 1);
const [project] = await sql<ProjectRow[]>`
  select id, repo_url, branch, live_url, start_cmd, port, last_scanned_sha from projects where id = ${projectId}
`;
if (!project) throw new Error('project not found');

const t0 = Date.now();
const sandbox = await openSandbox(project, {
  config,
  runId: 0,
  forceFull: false,
  needLiveApp: true,
  signal: AbortSignal.timeout(5 * 60_000),
});
try {
  console.log('baseUrl', sandbox.baseUrl);
  await sandbox.ready;
  console.log(`ready after ${Date.now() - t0}ms`);
  const res = await fetch(sandbox.baseUrl!);
  console.log('GET / ->', res.status, (await res.text()).match(/<title>(.*)<\/title>/)?.[1]);

  const ps = await run('docker', ['ps', '--filter', 'name=bs-0-app', '--format', '{{.Names}}'], { timeoutMs: 10_000 });
  const app = ps.stdout.trim().split('\n')[0]!;
  const egress = await run(
    'docker',
    ['exec', app, 'node', '-e', "fetch('https://example.com',{signal:AbortSignal.timeout(4000)}).then(()=>console.log('INTERNET REACHABLE')).catch(e=>console.log('no internet:', e.cause?.code ?? e.message))"],
    { timeoutMs: 15_000 },
  );
  console.log('egress check from app container:', egress.stdout.trim());

  const path = await sandbox.upload(Buffer.from('smoke test evidence'), 'txt');
  console.log('evidence uploaded:', path);
} finally {
  await sandbox.stop();
  await sql.end();
  const left = await run('docker', ['ps', '-a', '--filter', 'name=bs-0-', '--format', '{{.Names}}'], { timeoutMs: 10_000 });
  console.log('containers left after stop:', left.stdout.trim() || 'none');
}
