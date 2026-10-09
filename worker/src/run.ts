import { createAi, type AiClient, type AiUsage } from './ai.ts';
import { llmCache } from './cache.ts';
import { LIMITS, type Config } from './config.ts';
import type { Sql } from './db.ts';
import { explainPending } from './explainer.ts';
import { toBugs } from './normalize.ts';
import { untilAborted } from './exec.ts';
import { openSandbox, type Sandbox } from './sandbox.ts';
import { autoFix, autoVerify, setTesterStatus, upsertBugs, type TesterCoverage } from './store.ts';
import { resetSnippetCache } from './testers/util.ts';
import { TesterSkipped, type ProjectRow, type Tester, type TesterContext } from './types.ts';

type TesterStatus = 'done' | 'skipped' | 'failed';

interface TesterOutcome {
  name: string;
  status: TesterStatus;
  inserted: number;
  found: number;
  /** Files explicitly covered (setScope), or null for "the run's scope". */
  scope: string[] | null;
  detail?: string;
}

export interface RunDeps {
  sql: Sql;
  config: Config;
  testers: readonly Tester[];
  ai: AiClient;
  log: (msg: string) => void;
}

interface ClaimedRun {
  id: number;
  project_id: string;
  full_scan: boolean;
  trigger: 'manual' | 'push' | 'schedule';
}

interface RunProject extends ProjectRow {
  gemini_secret_id: string | null;
}

/** AI-written findings; excluded from "files tools already flag heavily". */
export const AI_TESTERS = ['review', 'testgen'];

/**
 * Claim a queued run. A message read again after its visibility timeout (read_ct > 1) means the
 * previous worker died mid-run, so a 'running' run is taken over instead of being stuck forever.
 */
async function claim(sql: Sql, runId: number, readCt: number): Promise<ClaimedRun | undefined> {
  const [run] = await sql<ClaimedRun[]>`
    update runs
    set status = 'running', started_at = now(), finished_at = null, testers = '{}'
    where id = ${runId} and (status = 'queued' or (status = 'running' and ${readCt} > 1))
    returning id, project_id, full_scan, trigger
  `;
  return run;
}

/** The workspace's own Gemini key (Vault) replaces the server key for this run's AI calls. */
async function aiForRun(deps: RunDeps, project: RunProject, log: (m: string) => void): Promise<AiClient> {
  if (!project.gemini_secret_id) return deps.ai;
  const [secret] = await deps.sql<{ key: string }[]>`
    select decrypted_secret as key from vault.decrypted_secrets where id = ${project.gemini_secret_id}
  `;
  if (!secret?.key) return deps.ai;
  log('using the workspace Gemini key');
  return createAi({ ...deps.config, GEMINI_KEY: secret.key }, deps.log);
}

export async function handleRun(deps: RunDeps, runId: number, readCt: number, outer: AbortSignal): Promise<void> {
  const { sql, config } = deps;
  const log = (m: string) => deps.log(`run ${runId}: ${m}`);
  const run = await claim(sql, runId, readCt);
  if (!run) return log('not queued any more, skipping');

  const [project] = await sql<RunProject[]>`
    select p.id, p.repo_url, p.branch, p.live_url, p.start_cmd, p.port, p.last_scanned_sha, w.gemini_secret_id
    from projects p join workspaces w on w.id = p.workspace_id
    where p.id = ${run.project_id}
  `;
  if (!project) throw new Error(`project ${run.project_id} not found`);

  const signal = AbortSignal.any([outer, AbortSignal.timeout(LIMITS.runMs)]);
  const started = Date.now();
  resetSnippetCache();

  const sandbox = await openSandbox(project, {
    config,
    runId,
    forceFull: run.full_scan,
    needLiveApp: deps.testers.some((t) => t.needsLiveApp),
    // Hourly runs with no new commits and nothing live to test cost nothing: no install, no Docker.
    skipIfUnchanged: run.trigger === 'schedule' && !run.full_scan && !project.live_url,
    signal,
  });

  try {
    if (sandbox.unchanged) {
      await sql`
        update runs set status = 'done', finished_at = now(), bugs_new = 0, bugs_fixed = 0,
          commit_sha = ${sandbox.sha}, full_scan = false, testers = ${sql.json({ skipped: 'no changes' })}
        where id = ${runId}
      `;
      return log(`no changes since ${sandbox.sha?.slice(0, 8)}, finished in ${Date.now() - started}ms without a sandbox`);
    }

    log(
      `${sandbox.fullScan ? 'full scan' : `incremental, ${sandbox.changed.length} changed file(s)`}` +
        `${sandbox.sha ? ` @ ${sandbox.sha.slice(0, 8)}` : ''}${sandbox.installError ? ` (${sandbox.installError.split('\n')[0]})` : ''}`,
    );
    // Record the effective scope: an incremental request becomes a full scan when there is nothing to diff against.
    await sql`update runs set commit_sha = ${sandbox.sha}, full_scan = ${sandbox.fullScan} where id = ${runId}`;
    await setTesterStatus(
      sql,
      runId,
      Object.fromEntries([
        ...deps.testers.map((t) => [t.name, 'running']),
        ...(sandbox.installError ? [['install', 'failed']] : []),
      ]),
    );

    const ai = await aiForRun(deps, project, log);
    const usage: AiUsage = {};
    const crawl = deferred<string[]>();
    const base = contextFor(sandbox, deps, project.id, runId, ai, usage, crawl, log);

    const settled = await Promise.allSettled(
      deps.testers.map((t) =>
        runTester(deps, t, base, AbortSignal.any([signal, AbortSignal.timeout(LIMITS.testerMs)]), () => {
          // Whatever happened to the crawler, page-based testers must not wait forever.
          if (t.name === 'playwright') crawl.resolve(sandbox.baseUrl ? [sandbox.baseUrl] : []);
        }),
      ),
    );
    const outcomes: TesterOutcome[] = settled.map((s, i) =>
      s.status === 'fulfilled'
        ? s.value
        : { name: deps.testers[i]!.name, status: 'failed', inserted: 0, found: 0, scope: null, detail: String(s.reason) },
    );

    if (signal.aborted) throw new Error(outer.aborted ? 'worker shutting down' : 'run exceeded 30 minutes');

    const coverage: TesterCoverage[] = outcomes
      .filter((o) => o.status === 'done')
      .map((o) => ({ tester: o.name, files: o.scope }));
    const coverageArgs = { projectId: project.id, runId, coverage, fullScan: sandbox.fullScan, changed: sandbox.changed };
    const verified = await autoVerify(sql, coverageArgs);
    const fixed = await autoFix(sql, coverageArgs);
    const bugsNew = outcomes.reduce((n, o) => n + o.inserted, 0);

    await setTesterStatus(sql, runId, { explainer: 'running' });
    const explained = await untilAborted(
      explainPending(sql, ai, project.id, usage, { maxBatches: config.EXPLAIN_MAX_BATCHES, log, signal }),
      signal,
      () => 'run exceeded 30 minutes',
    ).catch((err: unknown) => {
      log(`explainer failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    });
    if (signal.aborted) throw new Error(outer.aborted ? 'worker shutting down' : 'run exceeded 30 minutes');
    const explainerStatus = !ai.enabled ? 'skipped' : !explained ? 'failed' : explained.deferred ? 'deferred' : 'done';

    await sql`
      update runs set status = 'done', finished_at = now(), bugs_new = ${bugsNew}, bugs_fixed = ${fixed},
        ai_usage = ${sql.json(usage)}, testers = testers || ${sql.json({ explainer: explainerStatus })}
      where id = ${runId}
    `;
    // Only advance when every tester succeeded, so a failed tester re-checks these files next time.
    if (sandbox.sha && outcomes.every((o) => o.status !== 'failed')) {
      await sql`update projects set last_scanned_sha = ${sandbox.sha} where id = ${project.id}`;
    }
    const summary = outcomes.map((o) => `${o.name}=${o.status}${o.status === 'done' ? `(${o.found})` : ''}`).join(' ');
    log(
      `done in ${((Date.now() - started) / 1000).toFixed(1)}s, ${bugsNew} new, ${fixed} fixed, ${verified} verified. ${summary}`,
    );
  } finally {
    await sandbox.stop();
  }
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let done = false;
  const promise = new Promise<T>((r) => (resolve = r));
  return {
    promise,
    resolve: (v) => {
      if (done) return;
      done = true;
      resolve(v);
    },
  };
}

type BaseContext = Omit<TesterContext, 'signal' | 'setScope'>;

function contextFor(
  sandbox: Sandbox,
  deps: RunDeps,
  projectId: string,
  runId: number,
  ai: AiClient,
  aiUsage: AiUsage,
  crawl: Deferred<string[]>,
  log: (m: string) => void,
): BaseContext {
  const { sql } = deps;
  let counts: Promise<Map<string, number>> | undefined;
  return {
    projectId,
    runId,
    dir: sandbox.dir,
    sha: sandbox.sha,
    fullScan: sandbox.fullScan,
    changed: sandbox.changed,
    installed: sandbox.installed,
    baseUrl: sandbox.baseUrl,
    ready: sandbox.ready,
    isLiveUrl: sandbox.isLiveUrl,
    appLogs: sandbox.appLogs,
    semgrepConfig: deps.config.SEMGREP_CONFIG,
    ai,
    aiUsage,
    llmCache: llmCache(sql),
    aiLimits: { reviewMaxCalls: deps.config.REVIEW_MAX_CALLS, testgenMaxFiles: deps.config.TESTGEN_MAX_FILES },
    toolFindingCounts: () =>
      (counts ??= sql<{ file: string; n: number }[]>`
        select file, count(*)::int as n from bugs
        where project_id = ${projectId} and status = 'open' and file is not null and tester <> all(${AI_TESTERS})
        group by file
      `.then((rows) => new Map(rows.map((r) => [r.file, r.n])))),
    crawled: crawl.promise,
    publishCrawl: crawl.resolve,
    log,
    upload: sandbox.upload,
    exec: sandbox.exec,
  };
}

/** Never rejects: one tester failing must not fail the run. */
async function runTester(
  deps: RunDeps,
  tester: Tester,
  base: BaseContext,
  signal: AbortSignal,
  onSettled: () => void,
): Promise<TesterOutcome> {
  const { sql } = deps;
  const log = (m: string) => base.log(`${tester.name}: ${m}`);
  const t0 = Date.now();
  let scope: string[] | null = null;
  const ctx: TesterContext = { ...base, signal, log, setScope: (files) => (scope = [...new Set(files)]) };
  try {
    // Hard 10-minute limit even if the tester ignores its signal.
    const findings = await untilAborted(tester.run(ctx), signal, () =>
      signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError'
        ? 'exceeded the 10 minute tester limit'
        : 'run aborted',
    );
    const rows = toBugs(findings, base.projectId, base.runId);
    const inserted = await upsertBugs(sql, rows);
    await setTesterStatus(sql, base.runId, { [tester.name]: 'done' });
    log(`done in ${Date.now() - t0}ms, ${rows.length} finding(s), ${inserted} new${scope ? `, scope ${(scope as string[]).length} file(s)` : ''}`);
    return { name: tester.name, status: 'done', inserted, found: rows.length, scope };
  } catch (err) {
    const status: TesterStatus = err instanceof TesterSkipped ? 'skipped' : 'failed';
    const detail = err instanceof Error ? err.message : String(err);
    await setTesterStatus(sql, base.runId, { [tester.name]: status }).catch(() => {});
    log(`${status}: ${detail.split('\n')[0]}`);
    return { name: tester.name, status, inserted: 0, found: 0, scope: null, detail };
  } finally {
    onSettled();
  }
}
