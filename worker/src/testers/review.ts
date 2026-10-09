import { z } from 'zod';
import { AiUnavailable } from '../ai.ts';
import { redactSecrets } from '../normalize.ts';
import type { RawFinding, Tester } from '../types.ts';
import { directImports, isSource, numbered, readSources, sha256, trackedSourceFiles, type SourceFile } from './source.ts';
import { readSnippet, skip } from './util.ts';

/** Bump when the prompt changes so cached results are not reused for a different question. */
export const REVIEW_PROMPT_VERSION = 'review-v1';
const MAX_TOOL_FINDINGS = 10;
const MAX_FINDINGS_PER_FILE = 5;

export const REVIEW_SYSTEM = `You are a senior engineer reviewing ONE source file for real logic bugs.
Report only defects that make the code behave incorrectly at runtime: wrong conditions, off-by-one errors,
null/undefined access, wrong variable used, unhandled promise rejections, race conditions, incorrect math,
missing returns, broken error handling. Do NOT report style, naming, formatting, missing comments, types
that would be caught by a compiler, performance nits, or speculative issues.
Return ONLY JSON: {"findings":[{"line":number,"title":string,"explanation":string}]}
- line: the 1-based line number from the numbered input where the bug is.
- title: at most 80 characters.
- explanation: 1-2 sentences on what goes wrong.
At most ${MAX_FINDINGS_PER_FILE} findings. Return {"findings":[]} if the file has no real logic bugs.`;

const ReviewResult = z.object({
  findings: z
    .array(
      z.object({
        line: z.coerce.number().int().positive().optional(),
        title: z.string().trim().min(1),
        explanation: z.string().trim().default(''),
      }),
    )
    .max(20)
    .default([]),
});
export type ReviewResult = z.infer<typeof ReviewResult>;

export function reviewFindings(file: string, result: ReviewResult, dir: string): RawFinding[] {
  return result.findings.slice(0, MAX_FINDINGS_PER_FILE).map((f) => ({
    tester: 'review',
    rule: 'ai-review',
    category: 'logic' as const,
    message: `${f.title.slice(0, 80)}${f.explanation ? `: ${f.explanation}` : ''}`,
    file,
    line: f.line,
    evidence: { snippet: readSnippet(dir, file, f.line) },
  }));
}

/** Changed files plus their direct imports; every tracked source file on full scans. */
async function candidates(dir: string, fullScan: boolean, changed: string[]): Promise<SourceFile[]> {
  if (fullScan) return readSources(dir, await trackedSourceFiles(dir));
  const direct = await readSources(dir, changed.filter(isSource));
  const imported = new Set<string>();
  for (const f of direct) for (const imp of directImports(dir, f.path, f.content)) imported.add(imp);
  const seen = new Set(direct.map((f) => f.path));
  return [...direct, ...(await readSources(dir, [...imported].filter((p) => !seen.has(p))))];
}

export const review: Tester = {
  name: 'review',
  needsLiveApp: false,
  async run(ctx) {
    if (!ctx.dir) skip('no repository');
    if (!ctx.ai.enabled) skip('AI is not configured');
    const dir = ctx.dir;

    const counts = await ctx.toolFindingCounts();
    // Files the tools already flag heavily need fixing first; an AI review adds noise there.
    const files = (await candidates(dir, ctx.fullScan, ctx.changed)).filter(
      (f) => (counts.get(f.path) ?? 0) <= MAX_TOOL_FINDINGS,
    );
    if (files.length === 0) {
      ctx.setScope([]);
      return [];
    }

    const keyed = files.map((f) => ({ ...f, hash: sha256(`${REVIEW_PROMPT_VERSION}\n${f.content}`) }));
    const cached = await ctx.llmCache.get(keyed.map((f) => f.hash));
    const covered: string[] = [];
    const findings: RawFinding[] = [];
    const fresh: { hash: string; result: unknown }[] = [];
    let calls = 0;

    for (const f of keyed) {
      if (ctx.signal.aborted) break;
      let raw = cached.get(f.hash);
      if (raw === undefined) {
        if (calls >= ctx.aiLimits.reviewMaxCalls) continue; // next run picks these up
        calls++;
        try {
          raw = await ctx.ai.chatJSON(
            'review',
            REVIEW_SYSTEM,
            `File: ${f.path}\n\n${numbered(redactSecrets(f.content))}`,
            ctx.aiUsage,
          );
        } catch (err) {
          if (err instanceof AiUnavailable) {
            ctx.log(`AI unavailable, stopping after ${covered.length} file(s): ${err.message}`);
            break;
          }
          ctx.log(`${f.path}: ${err instanceof Error ? err.message : err}`);
          continue;
        }
        fresh.push({ hash: f.hash, result: raw });
      }
      const parsed = ReviewResult.safeParse(raw);
      if (!parsed.success) continue;
      covered.push(f.path);
      findings.push(...reviewFindings(f.path, parsed.data, dir));
    }

    await ctx.llmCache.put(fresh.filter((e) => ReviewResult.safeParse(e.result).success));
    ctx.log(`${covered.length}/${files.length} file(s) reviewed: ${fresh.length} new AI review(s), ${covered.length - fresh.length} from cache`);
    // Auto-fix may only close review bugs in files that were actually reviewed this run.
    ctx.setScope(covered);
    return findings;
  },
};
