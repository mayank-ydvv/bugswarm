import { z } from 'zod';
import { AiUnavailable, type AiClient, type AiUsage } from './ai.ts';
import type { Sql } from './db.ts';
import { redactSecrets } from './normalize.ts';
import { buildPrompt } from './prompt.ts';
import type { Severity } from './types.ts';

export const BATCH_SIZE = 25;
const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;

export const SYSTEM_PROMPT = `You explain software bugs found by automated tools to developers and non-developers.
Return ONLY a JSON object: {"bugs":[{"id":number,"title":string,"summary":string,"severity":string,"expected":string}]}
One item per input bug, same ids.
- title: at most 80 characters, describing the user-visible effect (not the tool rule name).
- summary: 2-3 sentences: what is wrong, and why it matters.
- severity: one of critical, high, medium, low.
  critical = data loss, security hole, crash, auth or payments broken;
  high = a core feature is broken;
  medium = a degraded feature or an edge case;
  low = cosmetic, style or minor performance.
- expected: one sentence describing the correct behaviour.
Do not invent details that are not in the input.`;

interface PendingBug {
  id: string; // bigint comes back as a string
  category: string;
  tester: string;
  technical: string | null;
  file: string | null;
  line: number | null;
  url: string | null;
  repro_steps: string[] | null;
  snippet: string | null;
  severity: Severity;
}

const Item = z.object({
  id: z.coerce.number().int(),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  severity: z.string(),
  expected: z.string().trim().optional(),
});

export interface Explanation {
  id: number;
  title: string;
  summary: string;
  severity: Severity;
  expected: string | null;
}

/** Keep only items for bugs in this batch; an unknown severity keeps the bug's default. */
export function validateExplanations(raw: unknown, batch: Map<number, { severity: Severity }>): Explanation[] {
  const list = (raw as { bugs?: unknown })?.bugs;
  if (!Array.isArray(list)) return [];
  const out = new Map<number, Explanation>();
  for (const candidate of list) {
    const parsed = Item.safeParse(candidate);
    if (!parsed.success) continue;
    const item = parsed.data;
    const original = batch.get(item.id);
    if (!original || out.has(item.id)) continue;
    const severity = (SEVERITIES as readonly string[]).includes(item.severity.toLowerCase())
      ? (item.severity.toLowerCase() as Severity)
      : original.severity;
    out.set(item.id, {
      id: item.id,
      title: item.title.slice(0, 80),
      summary: item.summary.slice(0, 1200),
      severity,
      expected: item.expected?.slice(0, 400) || null,
    });
  }
  return [...out.values()];
}

function toModelInput(b: PendingBug) {
  return {
    id: Number(b.id),
    category: b.category,
    tester: b.tester,
    location: b.file ? `${b.file}${b.line ? `:${b.line}` : ''}` : b.url,
    tool_output: b.technical ? redactSecrets(b.technical).slice(0, 1500) : null,
    // Secrets are stripped again here; gitleaks findings never carry a snippet at all.
    code: b.snippet && b.tester !== 'gitleaks' ? redactSecrets(b.snippet).slice(0, 1500) : undefined,
    repro: b.repro_steps ?? undefined,
  };
}

/**
 * Explain open bugs of one project, 25 per call. Every batch is marked explained even if the
 * model skipped some items, so the loop always terminates. If AI is unavailable, the remaining
 * bugs stay unexplained for the next run.
 */
export async function explainPending(
  sql: Sql,
  ai: AiClient,
  projectId: string,
  usage: AiUsage,
  opts: { maxBatches: number; log: (m: string) => void },
): Promise<{ explained: number; batches: number; deferred: boolean }> {
  if (!ai.enabled) return { explained: 0, batches: 0, deferred: false };
  let explained = 0;
  let batches = 0;

  while (batches < opts.maxBatches) {
    const pending = await sql<PendingBug[]>`
      select id, category, tester, technical, file, line, url, repro_steps,
             evidence->>'snippet' as snippet, severity
      from bugs
      where project_id = ${projectId} and not explained and status in ('open', 'in_progress')
      order by id
      limit ${BATCH_SIZE}
    `;
    if (pending.length === 0) break;
    batches++;

    let raw: unknown;
    try {
      raw = await ai.chatJSON('explain', SYSTEM_PROMPT, JSON.stringify({ bugs: pending.map(toModelInput) }), usage);
    } catch (err) {
      if (err instanceof AiUnavailable) {
        opts.log(`explainer: deferred (${err.message})`);
        return { explained, batches, deferred: true };
      }
      // Unparseable output from every provider: give up on this batch, don't loop on it forever.
      opts.log(`explainer: batch failed: ${err instanceof Error ? err.message : String(err)}`);
      raw = {};
    }

    const byId = new Map(pending.map((b) => [Number(b.id), b]));
    const items = validateExplanations(raw, byId);
    if (items.length > 0) await applyExplanations(sql, items, byId);
    await sql`update bugs set explained = true where id = any(${pending.map((b) => b.id)}::bigint[])`;
    explained += items.length;
    opts.log(`explainer: batch ${batches}: ${items.length}/${pending.length} explained`);
  }
  return { explained, batches, deferred: false };
}

async function applyExplanations(sql: Sql, items: Explanation[], byId: Map<number, PendingBug>) {
  const rows = items.map((e) => {
    const b = byId.get(e.id)!;
    const fix = buildPrompt({
      title: e.title,
      severity: e.severity,
      category: b.category,
      tester: b.tester,
      file: b.file,
      line: b.line,
      url: b.url,
      summary: e.summary,
      technical: b.technical,
      snippet: b.snippet,
      repro_steps: b.repro_steps,
      expected: e.expected,
    });
    // VALUES rows must be non-null strings; '' maps back to NULL below.
    return [String(e.id), e.title, e.summary, e.severity, e.expected ?? '', fix];
  });
  // One statement for the whole batch.
  await sql`
    update bugs set
      title = v.title,
      summary = v.summary,
      severity = v.severity::severity,
      expected = nullif(v.expected, ''),
      fix_prompt = v.fix_prompt
    from (values ${sql(rows)}) as v(id, title, summary, severity, expected, fix_prompt)
    where bugs.id = v.id::bigint
  `;
}
