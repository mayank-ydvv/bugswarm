import { createRequire } from 'node:module';
import { chromium, type Browser } from 'playwright';
import type { RawFinding, Tester } from '../types.ts';
import { skip } from './util.ts';

const AXE_PATH = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const MAX_PAGES = 15;
const IMPACTS = new Set(['serious', 'critical']);

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  helpUrl: string;
  nodes: { target: unknown[]; failureSummary?: string }[];
}

export function mapViolations(violations: AxeViolation[], path: string, location: string, screenshot?: string): RawFinding[] {
  return violations
    .filter((v) => v.impact && IMPACTS.has(v.impact))
    .map((v) => ({
      tester: 'axe',
      rule: `axe:${v.id}`,
      category: 'accessibility' as const,
      // One finding per rule per page.
      message: `${v.help} (${v.id}) on ${path}`,
      url: location,
      repro: [`Open ${location}`, `Run an accessibility check (axe rule "${v.id}")`, `See ${v.helpUrl}`],
      evidence: {
        screenshot,
        log: v.nodes
          .slice(0, 5)
          .map((n) => `${n.target.join(' ')}\n${n.failureSummary ?? ''}`)
          .join('\n\n'),
      },
    }));
}

export const axe: Tester = {
  name: 'axe',
  needsLiveApp: true,
  async run(ctx) {
    if (!ctx.baseUrl) skip('no app or live URL to test');
    try {
      await ctx.ready;
    } catch {
      skip('app is not reachable (reported by the playwright tester)');
    }
    const pages = (await ctx.crawled).slice(0, MAX_PAGES);
    if (pages.length === 0) skip('no pages were crawled');

    const findings: RawFinding[] = [];
    let browser: Browser | undefined;
    try {
      browser = await chromium.launch({ headless: true });
      const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
      for (const url of pages) {
        if (ctx.signal.aborted) break;
        try {
          await page.goto(url, { waitUntil: 'load', timeout: 15_000 });
          await page.addScriptTag({ path: AXE_PATH });
          const violations = await page.evaluate(async () => {
            const axe = (window as unknown as { axe: { run(ctx: Document, opts: object): Promise<{ violations: AxeViolation[] }> } }).axe;
            const res = await axe.run(document, { resultTypes: ['violations'] });
            return res.violations.map((v) => ({
              id: v.id,
              impact: v.impact,
              help: v.help,
              helpUrl: v.helpUrl,
              nodes: v.nodes.map((n) => ({ target: n.target, failureSummary: n.failureSummary })),
            }));
          });
          const relevant = violations.filter((v) => v.impact && IMPACTS.has(v.impact));
          if (relevant.length === 0) continue;
          let screenshot: string | undefined;
          try {
            screenshot = await ctx.upload(await page.screenshot({ type: 'jpeg', quality: 60 }), 'jpg');
          } catch {
            // evidence is best-effort
          }
          const u = new URL(url);
          const path = `${u.pathname}${u.search}`;
          findings.push(...mapViolations(relevant, path, ctx.isLiveUrl ? url : path, screenshot));
        } catch (err) {
          ctx.log(`skipping ${url}: ${err instanceof Error ? err.message.split('\n')[0] : err}`);
        }
      }
    } finally {
      await browser?.close().catch(() => {});
    }
    return findings;
  },
};
