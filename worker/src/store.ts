import type postgres from 'postgres';
import type { Sql } from './db.ts';
import type { BugRow } from './normalize.ts';

const CHUNK = 1000;
const COLUMNS = [
  'project_id',
  'fingerprint',
  'title',
  'technical',
  'severity',
  'category',
  'tester',
  'file',
  'line',
  'url',
  'evidence',
  'repro_steps',
  'fix_prompt',
  'first_seen_run',
  'last_seen_run',
] as const;

/**
 * One INSERT ... ON CONFLICT per chunk. A fixed/verified bug that shows up again reopens as a
 * regression; ignored and in-progress bugs keep their status. Returns how many rows were new.
 */
export async function upsertBugs(sql: Sql, rows: BugRow[]): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    // sql.json makes the jsonb encoding explicit (a pre-stringified value would be stored as a JSON string).
    const chunk = rows.slice(i, i + CHUNK).map((r) => ({ ...r, evidence: sql.json(r.evidence as postgres.JSONValue) }));
    const result = await sql<{ inserted: boolean }[]>`
      insert into bugs ${sql(chunk, ...COLUMNS)}
      on conflict (project_id, fingerprint) do update set
        last_seen_run = excluded.last_seen_run,
        evidence = excluded.evidence,
        line = excluded.line,
        technical = excluded.technical,
        -- Placeholder titles follow the latest tool message until the explainer writes a real one.
        title = case when bugs.explained then bugs.title else excluded.title end,
        fix_prompt = case when bugs.explained then bugs.fix_prompt else excluded.fix_prompt end,
        url = excluded.url,
        repro_steps = excluded.repro_steps,
        fixed_run = case when bugs.status in ('fixed', 'verified') then null else bugs.fixed_run end,
        verified_run = case when bugs.status in ('fixed', 'verified') then null else bugs.verified_run end,
        status = case when bugs.status in ('fixed', 'verified') then 'open'::bug_status else bugs.status end
      returning (xmax = 0) as inserted
    `;
    for (const r of result) if (r.inserted) inserted++;
  }
  return inserted;
}

/**
 * What a completed tester actually re-checked this run. `files: null` means "everything in the
 * run's scope" (all files on full scans, the changed files on incremental runs). Testers that only
 * cover part of the repo (AI review, test generation) report their exact files.
 */
export interface TesterCoverage {
  tester: string;
  files: string[] | null;
}

interface CoverageArgs {
  projectId: string;
  runId: number;
  coverage: TesterCoverage[];
  fullScan: boolean;
  changed: string[];
}

/** Split coverage into one "run scope" group plus one group per explicitly scoped tester. */
function groups(args: CoverageArgs): { testers: string[]; full: boolean; files: string[] }[] {
  const out: { testers: string[]; full: boolean; files: string[] }[] = [];
  const unscoped = args.coverage.filter((c) => c.files === null).map((c) => c.tester);
  if (unscoped.length && (args.fullScan || args.changed.length)) {
    out.push({ testers: unscoped, full: args.fullScan, files: args.changed });
  }
  for (const c of args.coverage) {
    if (c.files?.length) out.push({ testers: [c.tester], full: false, files: c.files });
  }
  return out;
}

/**
 * Bugs not seen this run are fixed, but only for testers that completed (a crashed or skipped
 * tester proves nothing) and only where that tester actually looked.
 */
export async function autoFix(sql: Sql, args: CoverageArgs): Promise<number> {
  let fixed = 0;
  for (const g of groups(args)) {
    const rows = await sql`
      update bugs set status = 'fixed', fixed_run = ${args.runId}
      where project_id = ${args.projectId}
        and status in ('open', 'in_progress')
        and last_seen_run < ${args.runId}
        and tester = any(${g.testers})
        and (${g.full} or file = any(${g.files}))
      returning id
    `;
    fixed += rows.length;
  }
  return fixed;
}

/**
 * On a full scan, bugs that were already fixed before this run and are still absent become
 * verified ("Fixed, verified by run #N").
 */
export async function autoVerify(sql: Sql, args: CoverageArgs): Promise<number> {
  if (!args.fullScan) return 0;
  let verified = 0;
  for (const g of groups(args)) {
    const rows = await sql`
      update bugs set status = 'verified', verified_run = ${args.runId}
      where project_id = ${args.projectId}
        and status = 'fixed'
        and coalesce(fixed_run, 0) < ${args.runId}
        and coalesce(last_seen_run, 0) < ${args.runId}
        and tester = any(${g.testers})
        and (${g.full} or file = any(${g.files}))
      returning id
    `;
    verified += rows.length;
  }
  return verified;
}

export async function setTesterStatus(sql: Sql, runId: number, statuses: Record<string, string>): Promise<void> {
  await sql`update runs set testers = testers || ${sql.json(statuses)} where id = ${runId}`;
}
