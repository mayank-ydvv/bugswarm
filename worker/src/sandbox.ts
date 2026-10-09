import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { LIMITS, type Config } from './config.ts';
import {
  APP_NETWORK,
  containerIp,
  containerLogs,
  ensureInternalNetwork,
  publishedPort,
  removeContainer,
  runContainer,
  startContainer,
} from './docker.ts';
import { runOk, sleep, type ExecResult } from './exec.ts';
import type { ExecOpts, ProjectRow } from './types.ts';

export interface Sandbox {
  /** True when skipIfUnchanged applied: only the git checkout happened. */
  unchanged: boolean;
  dir: string | null;
  sha: string | null;
  fullScan: boolean;
  changed: string[];
  installed: boolean;
  installError: string | null;
  baseUrl: string | null;
  ready: Promise<void>;
  isLiveUrl: boolean;
  appLogs(): Promise<string>;
  stop(): Promise<void>;
  upload(buffer: Buffer, ext: string): Promise<string>;
  exec(args: string[], opts?: ExecOpts): Promise<ExecResult>;
}

export interface SandboxOptions {
  config: Config;
  runId: number;
  forceFull: boolean;
  needLiveApp: boolean;
  /** Stop right after the git checkout if nothing changed (no install, no app, no Docker). */
  skipIfUnchanged?: boolean;
  signal: AbortSignal;
}

const LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock'];
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo' };

export async function openSandbox(project: ProjectRow, opts: SandboxOptions): Promise<Sandbox> {
  const cleanups: (() => Promise<void>)[] = [];
  const stop = async () => {
    for (const c of cleanups.reverse()) await c().catch(() => {});
  };

  try {
    const repo = project.repo_url ? await checkout(project, opts) : null;
    const dir = repo?.dir ?? null;

    if (opts.skipIfUnchanged && repo && !repo.fullScan && repo.changed.length === 0) {
      return {
        unchanged: true,
        dir,
        sha: repo.sha,
        fullScan: false,
        changed: [],
        installed: false,
        installError: null,
        ...noTarget('no changes'),
        isLiveUrl: false,
        appLogs: async () => '',
        stop,
        upload: () => Promise.reject(new Error('sandbox not started')),
        exec: () => Promise.reject(new Error('sandbox not started')),
      };
    }

    let installed = false;
    let installError: string | null = null;
    if (dir && existsSync(join(dir, 'package.json'))) {
      const result = await install(dir, repo!, opts);
      installed = result.ok;
      installError = result.error;
    }

    const live = await startLiveTarget(project, dir, opts, cleanups);

    return {
      unchanged: false,
      dir,
      sha: repo?.sha ?? null,
      fullScan: repo?.fullScan ?? true,
      changed: repo?.changed ?? [],
      installed,
      installError,
      baseUrl: live.baseUrl,
      ready: live.ready,
      isLiveUrl: Boolean(project.live_url),
      appLogs: () => (live.app ? containerLogs(live.app, 80) : Promise.resolve('')),
      stop,
      upload: (buffer, ext) => uploadEvidence(opts.config, project.id, opts.runId, buffer, ext),
      exec: (args, execOpts) => {
        if (!dir) throw new Error('no repository checked out');
        return runContainer({
          image: opts.config.SANDBOX_IMAGE,
          args,
          network: 'none',
          mounts: [{ host: dir, container: '/app', readOnly: !execOpts?.writable }],
          workdir: '/app',
          env: { HOME: '/tmp', CI: '1', NODE_OPTIONS: '--max-old-space-size=768' },
          asHostUser: true,
          label: `${opts.runId}-exec`,
          timeoutMs: execOpts?.timeoutMs ?? LIMITS.testerMs,
          signal: opts.signal,
        });
      },
    };
  } catch (err) {
    await stop();
    throw err;
  }
}

// ---------------------------------------------------------------------------------------------
// Repository

interface Checkout {
  dir: string;
  sha: string;
  fullScan: boolean;
  changed: string[];
  hadNodeModules: boolean;
}

function assertRepoUrl(url: string, allowFile: boolean) {
  const parsed = new URL(url);
  if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return;
  if (parsed.protocol === 'file:' && allowFile) return;
  throw new Error(`unsupported repo URL scheme ${parsed.protocol}`);
}

function git(dir: string | null, args: string[], signal: AbortSignal) {
  const base = ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false'];
  return runOk('git', dir ? [...base, '-C', dir, ...args] : [...base, ...args], {
    env: GIT_ENV,
    timeoutMs: LIMITS.gitMs,
    signal,
  });
}

async function checkout(project: ProjectRow, opts: SandboxOptions): Promise<Checkout> {
  const url = project.repo_url!;
  assertRepoUrl(url, opts.config.ALLOW_FILE_REPOS);
  if (!/^(?!-)(?!.*\.\.)[\w./-]+$/.test(project.branch)) throw new Error('invalid branch name');

  const dir = join(opts.config.WORK_ROOT, project.id);
  const branch = project.branch;
  const s = opts.signal;

  if (existsSync(join(dir, '.git'))) {
    await git(dir, ['remote', 'set-url', 'origin', url], s);
    await git(dir, ['fetch', '--prune', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`], s);
    await git(dir, ['reset', '--hard', `origin/${branch}`], s);
    // Keep node_modules so unchanged lockfiles skip the install.
    await git(dir, ['clean', '-ffdx', '-e', 'node_modules'], s);
  } else {
    await mkdir(opts.config.WORK_ROOT, { recursive: true });
    await git(null, ['clone', '--branch', branch, '--single-branch', '--', url, dir], s);
  }

  const sha = (await git(dir, ['rev-parse', 'HEAD'], s)).trim();
  const last = project.last_scanned_sha;
  let fullScan = opts.forceFull || !last;
  let changed: string[] = [];
  if (!fullScan && last !== sha) {
    try {
      // --no-renames lists both sides of a rename, so bugs in the old path get re-evaluated.
      const out = await git(dir, ['diff', '--name-only', '--no-renames', last!, sha], s);
      changed = out.split('\n').map((l) => l.trim()).filter(Boolean);
    } catch {
      // e.g. force-push removed the old commit: scan everything.
      fullScan = true;
    }
  }
  return { dir, sha, fullScan, changed: fullScan ? [] : changed, hadNodeModules: existsSync(join(dir, 'node_modules')) };
}

// ---------------------------------------------------------------------------------------------
// Dependencies

function installCommand(dir: string): string {
  if (existsSync(join(dir, 'package-lock.json')) || existsSync(join(dir, 'npm-shrinkwrap.json'))) {
    return 'npm ci --ignore-scripts --no-audit --no-fund';
  }
  if (existsSync(join(dir, 'pnpm-lock.yaml'))) {
    return 'corepack pnpm install --frozen-lockfile --ignore-scripts';
  }
  if (existsSync(join(dir, 'yarn.lock'))) return 'corepack yarn install --frozen-lockfile --ignore-scripts';
  return 'npm install --ignore-scripts --no-audit --no-fund';
}

async function install(dir: string, repo: Checkout, opts: SandboxOptions): Promise<{ ok: boolean; error: string | null }> {
  const depsChanged = repo.changed.some((f) => f === 'package.json' || LOCKFILES.includes(f));
  if (repo.hadNodeModules && !repo.fullScan && !depsChanged) return { ok: true, error: null };

  // Internet is needed to fetch packages; --ignore-scripts keeps install-time code from running.
  const r = await runContainer({
    image: opts.config.SANDBOX_IMAGE,
    args: ['sh', '-c', installCommand(dir)],
    network: 'bridge',
    mounts: [{ host: dir, container: '/app' }],
    workdir: '/app',
    env: { HOME: '/tmp', npm_config_cache: '/tmp/.npm', COREPACK_HOME: '/tmp/.corepack', CI: '1' },
    asHostUser: true,
    label: `${opts.runId}-install`,
    timeoutMs: LIMITS.installMs,
    signal: opts.signal,
  });
  if (r.timedOut) return { ok: false, error: 'dependency install timed out after 5 minutes' };
  if (r.code !== 0) return { ok: false, error: `dependency install failed: ${r.stderr.slice(-1500)}` };
  return { ok: true, error: null };
}

// ---------------------------------------------------------------------------------------------
// Live app

/** Tiny TCP relay: lets the host reach an app on the internal (no-internet) network. */
const RELAY_SCRIPT =
  "const n=require('net'),[h,p]=[process.env.T_HOST,+process.env.T_PORT];" +
  "n.createServer(c=>{const u=n.connect(p,h);c.pipe(u);u.pipe(c);" +
  "c.on('error',()=>u.destroy());u.on('error',()=>c.destroy())}).listen(8080)";

interface LiveTarget {
  baseUrl: string | null;
  ready: Promise<void>;
  app?: string;
}

function noTarget(reason: string): LiveTarget {
  const ready = Promise.reject(new Error(reason));
  ready.catch(() => {});
  return { baseUrl: null, ready };
}

async function startLiveTarget(
  project: ProjectRow,
  dir: string | null,
  opts: SandboxOptions,
  cleanups: (() => Promise<void>)[],
): Promise<LiveTarget> {
  if (project.live_url) {
    const ready = waitForHttp(project.live_url, LIMITS.appStartMs, opts.signal);
    ready.catch(() => {});
    return { baseUrl: project.live_url, ready };
  }
  if (!opts.needLiveApp) return noTarget('no live testers in this run');
  if (!dir || !existsSync(join(dir, 'package.json'))) return noTarget('nothing to start');

  await ensureInternalNetwork();
  const port = project.port;
  const app = await startContainer({
    image: opts.config.SANDBOX_IMAGE,
    args: ['sh', '-c', project.start_cmd],
    network: APP_NETWORK,
    mounts: [{ host: dir, container: '/app' }],
    workdir: '/app',
    env: { HOME: '/tmp', PORT: String(port), HOST: '0.0.0.0', HOSTNAME: '0.0.0.0', NODE_ENV: 'development' },
    asHostUser: true,
    label: `${opts.runId}-app`,
    signal: opts.signal,
  });
  cleanups.push(() => removeContainer(app));

  let baseUrl: string;
  if (opts.config.DOCKER_PUBLISH_PORTS) {
    const relay = await startContainer({
      image: opts.config.SANDBOX_IMAGE,
      args: ['node', '-e', RELAY_SCRIPT],
      network: 'bridge',
      env: { T_HOST: app, T_PORT: String(port) },
      label: `${opts.runId}-relay`,
      publish: '127.0.0.1::8080',
      signal: opts.signal,
    });
    cleanups.push(() => removeContainer(relay));
    await runOk('docker', ['network', 'connect', APP_NETWORK, relay], { timeoutMs: 15_000 });
    baseUrl = `http://127.0.0.1:${await publishedPort(relay, 8080)}`;
  } else {
    baseUrl = `http://${await containerIp(app, APP_NETWORK)}:${port}`;
  }

  const ready = waitForHttp(baseUrl, LIMITS.appStartMs, opts.signal);
  ready.catch(() => {});
  return { baseUrl, ready, app };
}

/** Poll every second until the server answers with status < 500. */
export async function waitForHttp(url: string, timeoutMs: number, signal: AbortSignal): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = 'no response';
  while (Date.now() < deadline) {
    if (signal.aborted) throw new Error('aborted');
    try {
      const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5_000) });
      await res.body?.cancel();
      if (res.status < 500) return;
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    await sleep(1_000);
  }
  throw new Error(`app did not become ready within ${timeoutMs / 1000}s (${last})`);
}

// ---------------------------------------------------------------------------------------------
// Evidence

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webm: 'video/webm',
  txt: 'text/plain',
  json: 'application/json',
};

async function uploadEvidence(config: Config, projectId: string, runId: number, buffer: Buffer, ext: string) {
  const clean = ext.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const path = `${projectId}/${runId}/${randomUUID()}.${clean}`;
  const res = await fetch(`${config.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/evidence/${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: config.SUPABASE_SERVICE_ROLE_KEY,
      'content-type': CONTENT_TYPES[clean] ?? 'application/octet-stream',
    },
    body: new Uint8Array(buffer),
  });
  if (!res.ok) throw new Error(`evidence upload failed: ${res.status} ${await res.text()}`);
  return path;
}
