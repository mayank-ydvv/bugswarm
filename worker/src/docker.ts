import { randomBytes } from 'node:crypto';
import { run, runOk, type ExecResult } from './exec.ts';

/** Applied to every container that touches project code. The Docker socket is never mounted. */
export const HARDENING = [
  '--cpus=1',
  '--memory=1g',
  '--pids-limit=256',
  '--cap-drop=ALL',
  '--security-opt=no-new-privileges',
] as const;

export const APP_NETWORK = 'bsnet';

export interface Mount {
  host: string;
  container: string;
  readOnly?: boolean;
}

export interface ContainerSpec {
  image: string;
  /** Arguments after the image (command + args). */
  args: string[];
  /** 'none' (default), 'bridge' (internet, e.g. npm install, rule downloads), or APP_NETWORK. */
  network?: string;
  mounts?: Mount[];
  workdir?: string;
  env?: Record<string, string>;
  /** Run as the host user so files written into mounts stay owned by them. */
  asHostUser?: boolean;
  entrypoint?: string;
  label: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

export function containerName(label: string): string {
  return `bs-${label}-${randomBytes(3).toString('hex')}`.replace(/[^a-zA-Z0-9_.-]/g, '-');
}

function hostUser(): string[] {
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  return uid === undefined || gid === undefined ? [] : ['--user', `${uid}:${gid}`];
}

function baseArgs(spec: Omit<ContainerSpec, 'timeoutMs'>, name: string): string[] {
  const args = ['--name', name, ...HARDENING, `--network=${spec.network ?? 'none'}`];
  for (const m of spec.mounts ?? []) {
    args.push('-v', `${m.host}:${m.container}${m.readOnly ? ':ro' : ''}`);
  }
  if (spec.workdir) args.push('-w', spec.workdir);
  for (const [k, v] of Object.entries(spec.env ?? {})) args.push('-e', `${k}=${v}`);
  if (spec.asHostUser) args.push(...hostUser());
  if (spec.entrypoint !== undefined) args.push('--entrypoint', spec.entrypoint);
  return args;
}

export async function removeContainer(name: string): Promise<void> {
  await run('docker', ['rm', '-f', name], { timeoutMs: 30_000 }).catch(() => {});
}

/** Run a container to completion. On timeout or abort the container is force-removed. */
export function runContainer(spec: ContainerSpec): Promise<ExecResult> {
  const name = containerName(spec.label);
  return run('docker', ['run', '--rm', ...baseArgs(spec, name), spec.image, ...spec.args], {
    timeoutMs: spec.timeoutMs,
    signal: spec.signal,
    onKill: () => removeContainer(name),
  });
}

/** Start a detached container and return its name. */
export async function startContainer(spec: Omit<ContainerSpec, 'timeoutMs'> & { publish?: string }): Promise<string> {
  const name = containerName(spec.label);
  const args = ['run', '-d', ...baseArgs(spec, name)];
  if (spec.publish) args.push('-p', spec.publish);
  await runOk('docker', [...args, spec.image, ...spec.args], { timeoutMs: 60_000, signal: spec.signal });
  return name;
}

export async function ensureInternalNetwork(): Promise<void> {
  const r = await run('docker', ['network', 'inspect', APP_NETWORK], { timeoutMs: 15_000 });
  if (r.code === 0) return;
  const created = await run('docker', ['network', 'create', '--internal', APP_NETWORK], { timeoutMs: 15_000 });
  // Another worker loop may have created it concurrently.
  if (created.code !== 0 && !created.stderr.includes('already exists')) {
    throw new Error(`docker network create failed: ${created.stderr}`);
  }
}

export async function containerIp(name: string, network: string): Promise<string> {
  const out = await runOk(
    'docker',
    ['inspect', '-f', `{{(index .NetworkSettings.Networks "${network}").IPAddress}}`, name],
    { timeoutMs: 15_000 },
  );
  const ip = out.trim();
  if (!ip) throw new Error(`container ${name} has no IP on ${network}`);
  return ip;
}

export async function publishedPort(name: string, containerPort: number): Promise<number> {
  const out = await runOk('docker', ['port', name, `${containerPort}/tcp`], { timeoutMs: 15_000 });
  const m = /:(\d+)\s*$/m.exec(out.trim());
  if (!m?.[1]) throw new Error(`no published port for ${name}: ${out}`);
  return Number(m[1]);
}

export async function containerLogs(name: string, tail = 200): Promise<string> {
  const r = await run('docker', ['logs', '--tail', String(tail), name], { timeoutMs: 15_000 });
  return `${r.stdout}${r.stderr}`;
}
