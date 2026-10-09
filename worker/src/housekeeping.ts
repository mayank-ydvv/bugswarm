/**
 * Daily cleanup (systemd timer in production, `pnpm housekeeping` locally):
 * - evidence files older than EVIDENCE_RETENTION_DAYS (deleted through the Storage API)
 * - llm_cache entries older than LLM_CACHE_RETENTION_DAYS
 * - heartbeats of workers gone for over a day
 * - checkouts in WORK_ROOT whose project no longer exists
 * - exited sandbox containers and dangling Docker images
 * Each step is independent: one failing does not stop the others.
 */
import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig, type Config } from './config.ts';
import { connect, type Sql } from './db.ts';
import { run } from './exec.ts';

const STORAGE_DELETE_BATCH = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function deleteOldEvidence(sql: Sql, config: Config): Promise<number> {
  // Direct deletes on storage.objects are blocked (they would orphan files); list here, delete via the API.
  const rows = await sql<{ name: string }[]>`
    select name from storage.objects
    where bucket_id = 'evidence' and created_at < now() - make_interval(days => ${config.EVIDENCE_RETENTION_DAYS})
  `;
  let deleted = 0;
  for (let i = 0; i < rows.length; i += STORAGE_DELETE_BATCH) {
    const prefixes = rows.slice(i, i + STORAGE_DELETE_BATCH).map((r) => r.name);
    const res = await fetch(`${config.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/evidence`, {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: config.SUPABASE_SERVICE_ROLE_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ prefixes }),
    });
    if (!res.ok) throw new Error(`storage delete failed: ${res.status} ${await res.text()}`);
    deleted += prefixes.length;
  }
  return deleted;
}

export async function pruneTables(sql: Sql, config: Config) {
  const cache = await sql`
    delete from llm_cache where created_at < now() - make_interval(days => ${config.LLM_CACHE_RETENTION_DAYS})
  `;
  const beats = await sql`delete from worker_heartbeats where last_seen_at < now() - interval '1 day'`;
  return { llmCache: cache.count, heartbeats: beats.count };
}

/** Remove checkouts (WORK_ROOT/<projectId>) of projects that were deleted. */
export async function removeOrphanCheckouts(sql: Sql, workRoot: string): Promise<string[]> {
  let dirs: string[];
  try {
    dirs = (await readdir(workRoot, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return []; // nothing checked out yet
  }
  const ids = dirs.filter((d) => UUID.test(d));
  if (ids.length === 0) return [];
  const existing = await sql<{ id: string }[]>`select id::text from projects where id = any(${ids}::uuid[])`;
  const keep = new Set(existing.map((r) => r.id));
  const orphans = ids.filter((id) => !keep.has(id));
  for (const id of orphans) await rm(join(workRoot, id), { recursive: true, force: true });
  return orphans;
}

export async function pruneDocker(): Promise<string> {
  const exited = await run(
    'docker',
    ['ps', '-aq', '--filter', 'name=^bs-', '--filter', 'status=exited', '--filter', 'status=dead'],
    { timeoutMs: 30_000 },
  );
  const ids = exited.stdout.split('\n').filter(Boolean);
  if (ids.length) await run('docker', ['rm', '-f', ...ids], { timeoutMs: 60_000 });
  // Dangling layers only; the sandbox and tool images stay cached for fast runs.
  const images = await run('docker', ['image', 'prune', '-f'], { timeoutMs: 5 * 60_000 });
  const reclaimed = /Total reclaimed space: (.+)/.exec(images.stdout)?.[1] ?? '0B';
  return `${ids.length} exited container(s), ${reclaimed} of images`;
}

async function main() {
  const config = loadConfig();
  const sql = connect(config.DATABASE_URL, 2);
  const step = async (name: string, fn: () => Promise<unknown>) => {
    try {
      console.log(`housekeeping: ${name}: ${JSON.stringify(await fn())}`);
    } catch (err) {
      process.exitCode = 1;
      console.error(`housekeeping: ${name} failed: ${err instanceof Error ? err.message : err}`);
    }
  };
  await step('evidence files deleted', () => deleteOldEvidence(sql, config));
  await step('rows deleted', () => pruneTables(sql, config));
  await step('orphan checkouts removed', () => removeOrphanCheckouts(sql, config.WORK_ROOT));
  await step('docker', pruneDocker);
  await sql.end({ timeout: 5 });
}

if (import.meta.filename === process.argv[1]) await main();
