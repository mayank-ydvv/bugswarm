import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { SEVERITIES, type Bug, type BugStatus, type Severity } from './types.ts';

export const PAGE_SIZE = 50;

export const BUG_LIST_COLUMNS =
  'id, title, severity, category, tester, file, line, url, status, created_at, verified_run' as const;
export type BugListRow = Pick<
  Bug,
  'id' | 'title' | 'severity' | 'category' | 'tester' | 'file' | 'line' | 'url' | 'status' | 'created_at' | 'verified_run'
>;

export const STATUSES: readonly BugStatus[] = ['open', 'in_progress', 'fixed', 'verified', 'ignored'];
export const CATEGORIES = ['logic', 'security', 'ui', 'performance', 'accessibility', 'dependency', 'type'] as const;
export const TESTERS = ['eslint', 'tsc', 'semgrep', 'gitleaks', 'osv', 'playwright', 'lighthouse', 'axe', 'review', 'testgen'] as const;

export const STATUS_LABEL: Record<BugStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  fixed: 'Fixed',
  verified: 'Verified',
  ignored: 'Not a bug',
};

export interface BugFilters {
  status: BugStatus[];
  severity: Severity[];
  category: string[];
  tester: string[];
  q: string;
}

export const DEFAULT_FILTERS: BugFilters = { status: ['open'], severity: [], category: [], tester: [], q: '' };

export interface Cursor {
  severity: Severity;
  id: number;
}

/** PostgREST `or=(...)` syntax breaks on these; ILIKE wildcards are stripped too. */
export function sanitizeSearch(q: string): string {
  return q.replace(/[,()"\\*%:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
}

/**
 * One page of the bug list. Keyset pagination on (severity rank, id desc): the enum's declaration
 * order is its rank, so `severity > s` means "less severe". Never OFFSET.
 */
export function bugPageQuery(
  supabase: SupabaseClient<Database>,
  projectId: string,
  f: BugFilters,
  cursor: Cursor | null,
) {
  let q = supabase.from('bugs').select(BUG_LIST_COLUMNS).eq('project_id', projectId);
  if (f.status.length) q = q.in('status', f.status);
  if (f.severity.length) q = q.in('severity', f.severity);
  if (f.category.length) q = q.in('category', f.category);
  if (f.tester.length) q = q.in('tester', f.tester);
  const term = sanitizeSearch(f.q);
  if (term) q = q.or(`title.ilike.*${term}*,file.ilike.*${term}*`);
  if (cursor) q = q.or(`severity.gt.${cursor.severity},and(severity.eq.${cursor.severity},id.lt.${cursor.id})`);
  return q.order('severity', { ascending: true }).order('id', { ascending: false }).limit(PAGE_SIZE);
}

/** Same predicate as bugPageQuery, for Realtime events. */
export function matchesFilters(b: BugListRow, f: BugFilters): boolean {
  if (f.status.length && !f.status.includes(b.status)) return false;
  if (f.severity.length && !f.severity.includes(b.severity)) return false;
  if (f.category.length && !f.category.includes(b.category)) return false;
  if (f.tester.length && !f.tester.includes(b.tester)) return false;
  const term = sanitizeSearch(f.q).toLowerCase();
  if (term && !b.title.toLowerCase().includes(term) && !(b.file ?? '').toLowerCase().includes(term)) return false;
  return true;
}

const RANK = new Map(SEVERITIES.map((s, i) => [s, i]));

export function compareBugs(a: BugListRow, b: BugListRow): number {
  return (RANK.get(a.severity) ?? 9) - (RANK.get(b.severity) ?? 9) || b.id - a.id;
}

export function bugLocation(b: Pick<Bug, 'file' | 'line' | 'url'>): string {
  if (b.file) return b.line ? `${b.file}:${b.line}` : b.file;
  if (b.url) {
    try {
      const u = new URL(b.url);
      return `${u.pathname}${u.search}`;
    } catch {
      return b.url; // sandboxed apps store the path only
    }
  }
  return '—';
}

/** GitHub blob link at the commit the bug was last seen at, when the repo is on github.com. */
export function githubBlobUrl(repoUrl: string | null, sha: string | null, file: string | null, line: number | null) {
  if (!repoUrl || !sha || !file) return null;
  const m = /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(repoUrl);
  if (!m) return null;
  const path = file.split('/').map(encodeURIComponent).join('/');
  return `https://github.com/${m[1]}/${m[2]}/blob/${sha}/${path}${line ? `#L${line}` : ''}`;
}

/** "Fixed ✓ verified by run #N" for verified bugs, the plain label otherwise. */
export function statusText(b: Pick<Bug, 'status' | 'verified_run'>): string {
  if (b.status === 'verified' && b.verified_run) return `Fixed ✓ verified by run #${b.verified_run}`;
  return STATUS_LABEL[b.status];
}

/** One prompt for several bugs, most severe first, separated by ---. */
export function combinePrompts(prompts: string[]): string {
  return [`Fix these ${prompts.length} bugs one by one.`, ...prompts].join('\n\n---\n\n');
}
