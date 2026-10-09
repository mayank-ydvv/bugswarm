import { spawn } from 'node:child_process';

export interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface ExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs: number;
  signal?: AbortSignal;
  /** Called on timeout/abort, e.g. `docker rm -f` (killing the docker CLI leaves the container running). */
  onKill?: () => Promise<void> | void;
  maxOutputBytes?: number;
}

const DEFAULT_MAX_OUTPUT = 32 * 1024 * 1024;

/** Run a command without a shell. Never rejects on non-zero exit; callers inspect `code`. */
export function run(cmd: string, args: string[], opts: ExecOptions): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) return reject(new Error('aborted'));
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env ?? process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    const max = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let outBytes = 0;
    let errBytes = 0;
    let timedOut = false;

    child.stdout.on('data', (b: Buffer) => {
      if (outBytes < max) out.push(b);
      outBytes += b.length;
    });
    child.stderr.on('data', (b: Buffer) => {
      if (errBytes < max) err.push(b);
      errBytes += b.length;
    });

    const kill = () => {
      child.kill('SIGKILL');
      void Promise.resolve(opts.onKill?.()).catch(() => {});
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, opts.timeoutMs);
    const onAbort = () => kill();
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    child.on('error', (e) => {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      if (opts.signal?.aborted) return reject(new Error('aborted'));
      resolve({
        code,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
        timedOut,
      });
    });
  });
}

export async function runOk(cmd: string, args: string[], opts: ExecOptions): Promise<string> {
  const r = await run(cmd, args, opts);
  if (r.timedOut) throw new Error(`${cmd} ${args[0] ?? ''} timed out`);
  if (r.code !== 0) throw new Error(`${cmd} ${args.slice(0, 2).join(' ')} failed (${r.code}): ${r.stderr.slice(-2000)}`);
  return r.stdout;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
