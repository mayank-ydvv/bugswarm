import type { AiClient, AiUsage } from './ai.ts';
import type { ExecResult } from './exec.ts';

export type Category =
  | 'logic'
  | 'security'
  | 'ui'
  | 'performance'
  | 'accessibility'
  | 'dependency'
  | 'type';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface Evidence {
  snippet?: string;
  log?: string;
  /** Storage path in the `evidence` bucket, never inline bytes. */
  screenshot?: string;
  video?: string;
}

export interface RawFinding {
  tester: string;
  rule: string;
  category: Category;
  message: string;
  file?: string;
  line?: number;
  url?: string;
  evidence?: Evidence;
  repro?: string[];
  /** Overrides the category's default severity when the tool itself rates the problem (e.g. CVSS). */
  severity?: Severity;
}

export interface ExecOpts {
  timeoutMs?: number;
  /** Mount the checkout read-write (test generation writes its test files and runner caches). */
  writable?: boolean;
}

export interface LlmCache {
  /** One query for many hashes. */
  get(hashes: string[]): Promise<Map<string, unknown>>;
  put(entries: { hash: string; result: unknown }[]): Promise<void>;
}

export interface TesterContext {
  projectId: string;
  runId: number;
  /** Checked-out repo on the host, or null for live-URL-only projects. */
  dir: string | null;
  sha: string | null;
  fullScan: boolean;
  /** Repo-relative paths changed since the last scanned commit (includes deletions). Empty on full scans. */
  changed: string[];
  /** Whether dependencies are installed in `dir` (install can fail without failing the run). */
  installed: boolean;
  baseUrl: string | null;
  ready: Promise<void>;
  /** True when baseUrl is the project's own live URL rather than an app started in the sandbox. */
  isLiveUrl: boolean;
  /** Recent output of the sandboxed app (empty for live URLs). */
  appLogs(): Promise<string>;
  signal: AbortSignal;
  semgrepConfig: string;
  ai: AiClient;
  /** Shared by every AI caller in the run; saved to runs.ai_usage. */
  aiUsage: AiUsage;
  llmCache: LlmCache;
  aiLimits: { reviewMaxCalls: number; testgenMaxFiles: number };
  /** Open, non-AI bugs per file, for skipping files that tools already flag heavily. */
  toolFindingCounts(): Promise<Map<string, number>>;
  /** Pages the Playwright crawler reached (falls back to [baseUrl] if it did not run). */
  crawled: Promise<string[]>;
  publishCrawl(urls: string[]): void;
  /** Declare the exact files this tester covered; auto-fix then only touches bugs in those files. */
  setScope(files: string[]): void;
  log(msg: string): void;
  upload(buffer: Buffer, ext: string): Promise<string>;
  /** Run a command in the project's toolchain container (cwd /app, repo mounted read-only, no network). */
  exec(args: string[], opts?: ExecOpts): Promise<ExecResult>;
}

export interface Tester {
  name: string;
  needsLiveApp: boolean;
  run(ctx: TesterContext): Promise<RawFinding[]>;
}

/** Thrown by a tester that does not apply to this project/run. Its old bugs are left untouched. */
export class TesterSkipped extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'TesterSkipped';
  }
}

export interface ProjectRow {
  id: string;
  repo_url: string | null;
  branch: string;
  live_url: string | null;
  start_cmd: string;
  port: number;
  last_scanned_sha: string | null;
}
