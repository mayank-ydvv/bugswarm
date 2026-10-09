import { createHash } from 'node:crypto';
import { buildPrompt } from './prompt.ts';
import type { Category, Evidence, RawFinding, Severity } from './types.ts';

/** Volatile parts of a message (quoted names, numbers, hashes) must not change the fingerprint. */
export function normalize(msg: string): string {
  return msg
    .toLowerCase()
    .replace(/(["'`])(?:(?!\1).)*\1/g, 'S')
    .replace(/\b0x[0-9a-f]+\b/g, 'H')
    .replace(/\b[0-9a-f]{7,}\b/g, (m) => (/[a-f]/.test(m) && /\d/.test(m) ? 'H' : m))
    .replace(/\b\d+\b/g, 'N')
    .replace(/\s+/g, ' ')
    .trim();
}

export function fingerprint(f: Pick<RawFinding, 'category' | 'rule' | 'file' | 'message'>): string {
  return createHash('sha1')
    .update([f.category, f.rule, f.file ?? '', normalize(f.message)].join('|'))
    .digest('hex');
}

export const DEFAULT_SEVERITY: Record<Category, Severity> = {
  security: 'high',
  logic: 'high',
  dependency: 'medium',
  ui: 'medium',
  type: 'medium',
  performance: 'low',
  accessibility: 'low',
};

const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  /\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{10,}\b/g,
  /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  // key = "value" style assignments of secret-looking names.
  /((?:secret|token|password|passwd|api[_-]?key|private[_-]?key|access[_-]?key)\w*\s*[:=]\s*)(["'`])[^"'`\s]{8,}\2/gi,
];

/** Strip secret-looking values. Applied to every evidence string before it is stored or sent to an AI provider. */
export function redactSecrets(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (m, ...groups) => {
      // Assignment pattern: keep the key, redact the value.
      if (typeof groups[0] === 'string' && typeof groups[1] === 'string' && /[:=]\s*$/.test(groups[0])) {
        return `${groups[0]}${groups[1]}[REDACTED]${groups[1]}`;
      }
      return '[REDACTED]';
    });
  }
  return out;
}

function cleanEvidence(e: Evidence | undefined): Evidence {
  if (!e) return {};
  const out: Evidence = {};
  if (e.snippet) out.snippet = redactSecrets(e.snippet).slice(0, 4000);
  if (e.log) out.log = redactSecrets(e.log).slice(0, 8000);
  if (e.screenshot) out.screenshot = e.screenshot;
  if (e.video) out.video = e.video;
  return out;
}

export interface BugRow {
  project_id: string;
  fingerprint: string;
  title: string;
  technical: string;
  severity: Severity;
  category: Category;
  tester: string;
  file: string | null;
  line: number | null;
  url: string | null;
  /** Passed as an object: the postgres driver JSON-encodes jsonb parameters itself. */
  evidence: Evidence;
  repro_steps: string[] | null;
  /** Built from raw tool data; the explainer replaces it with a plain-English version. */
  fix_prompt: string;
  first_seen_run: number;
  last_seen_run: number;
}

/**
 * Findings -> bug rows, deduped by fingerprint. Postgres rejects an ON CONFLICT DO UPDATE that hits
 * the same key twice in one statement, so duplicates must be collapsed here (first one wins).
 */
export function toBugs(findings: RawFinding[], projectId: string, runId: number): BugRow[] {
  const byFp = new Map<string, BugRow>();
  for (const f of findings) {
    const message = redactSecrets(f.message.trim());
    if (!message) continue;
    const fp = fingerprint({ ...f, message });
    if (byFp.has(fp)) continue;
    const evidence = cleanEvidence(f.evidence);
    const base = {
      title: message.split('\n')[0]!.slice(0, 120),
      technical: message.slice(0, 4000),
      severity: DEFAULT_SEVERITY[f.category],
      category: f.category,
      tester: f.tester,
      file: f.file ?? null,
      line: f.line ?? null,
      url: f.url ?? null,
      repro_steps: f.repro?.length ? f.repro : null,
    };
    byFp.set(fp, {
      project_id: projectId,
      fingerprint: fp,
      ...base,
      evidence,
      fix_prompt: buildPrompt({ ...base, summary: null, snippet: evidence.snippet, expected: null }),
      first_seen_run: runId,
      last_seen_run: runId,
    });
  }
  return [...byFp.values()];
}
