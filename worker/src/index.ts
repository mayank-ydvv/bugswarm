import { createAi } from './ai.ts';
import { LIMITS, loadConfig } from './config.ts';
import { connect } from './db.ts';
import { ensureInternalNetwork } from './docker.ts';
import { sleep } from './exec.ts';
import { handleRun } from './run.ts';
import { TESTERS } from './testers/index.ts';

const config = loadConfig();
const sql = connect(config.DATABASE_URL, config.CONCURRENCY * 2 + 2);
const shutdown = new AbortController();

const log = (msg: string) => console.log(`${new Date().toISOString()} ${msg}`);
const ai = createAi(config, log);

interface QueueMessage {
  msg_id: string;
  read_ct: number;
  message: { run_id?: number };
}

async function loop(worker: number): Promise<void> {
  const deps = { sql, config, testers: TESTERS, ai, log: (m: string) => log(`[w${worker}] ${m}`) };
  while (!shutdown.signal.aborted) {
    let msg: QueueMessage | undefined;
    try {
      [msg] = await sql<QueueMessage[]>`
        select msg_id, read_ct, message from pgmq.read('runs', ${LIMITS.queueVisibilitySec}, 1)
      `;
    } catch (err) {
      deps.log(`queue read failed: ${(err as Error).message}`);
      await sleep(5_000);
      continue;
    }
    if (!msg) {
      await sleep(LIMITS.idleSleepMs);
      continue;
    }

    const runId = Number(msg.message.run_id);
    // pgmq.read hides the message for 30 minutes, the same as the run limit, so a run near the limit
    // would reappear and be taken over while still finishing. Extend it past the limit plus cleanup.
    await sql`select pgmq.set_vt('runs', ${msg.msg_id}::bigint, ${LIMITS.runMs / 1000 + 600})`.catch(() => {});
    try {
      if (!Number.isSafeInteger(runId)) throw new Error(`bad message ${JSON.stringify(msg.message)}`);
      await handleRun(deps, runId, msg.read_ct, shutdown.signal);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      deps.log(`run ${runId}: failed: ${detail}`);
      if (Number.isSafeInteger(runId)) {
        await sql`
          update runs set status = 'failed', finished_at = now(),
            testers = testers || ${sql.json({ error: detail.slice(0, 500) })}
          where id = ${runId} and status in ('queued', 'running')
        `.catch(() => {});
      }
    } finally {
      await sql`select pgmq.delete('runs', ${msg.msg_id}::bigint)`.catch(() => {});
    }
  }
}

async function main() {
  await ensureInternalNetwork();
  log(
    `worker started: concurrency=${config.CONCURRENCY}, testers=${TESTERS.map((t) => t.name).join(',')}, ` +
      `ai=${[config.GEMINI_KEY && 'gemini', config.OPENROUTER_KEY && 'openrouter'].filter(Boolean).join('+') || 'off'}`,
  );
  const loops = Array.from({ length: config.CONCURRENCY }, (_, i) => loop(i + 1));

  const stop = (sig: string) => {
    if (shutdown.signal.aborted) process.exit(1); // second Ctrl-C: exit now
    log(`${sig}: finishing (active runs are marked failed)…`);
    shutdown.abort();
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));

  await Promise.all(loops);
  await sql.end({ timeout: 5 });
  log('worker stopped');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
