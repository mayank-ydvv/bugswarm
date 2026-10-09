import { createServer } from 'node:net';
import lighthouseRun from 'lighthouse';
import { chromium, type Browser } from 'playwright';
import type { RawFinding, Tester } from '../types.ts';
import { skip } from './util.ts';

const MAX_PAGES = 5;
const POOR = 0.5; // Lighthouse audit scores are 0..1; below 0.5 is "poor"

const AUDITS: Record<string, string> = {
  'largest-contentful-paint': 'Largest Contentful Paint',
  'cumulative-layout-shift': 'Cumulative Layout Shift',
  'render-blocking-resources': 'Render-blocking resources',
};

interface LhAudit {
  score: number | null;
  displayValue?: string;
  details?: { items?: { url?: string }[] };
}
interface Lhr {
  categories: { performance?: { score: number | null } };
  audits: Record<string, LhAudit | undefined>;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      srv.close(() => (typeof addr === 'object' && addr ? resolve(addr.port) : reject(new Error('no port'))));
    });
  });
}

export function mapLighthouse(lhr: Lhr, path: string, location: string): RawFinding[] {
  const out: RawFinding[] = [];
  const base = { tester: 'lighthouse', category: 'performance' as const, url: location };
  const repro = [`Open ${location} in Chrome`, 'Run Lighthouse (mobile, performance)'];
  const score = lhr.categories.performance?.score;
  if (typeof score === 'number' && score * 100 < 50) {
    out.push({
      ...base,
      rule: 'lighthouse:performance',
      message: `Page ${path} scores ${Math.round(score * 100)}/100 for performance (Lighthouse, mobile)`,
      repro,
    });
  }
  for (const [id, label] of Object.entries(AUDITS)) {
    const a = lhr.audits[id];
    if (!a || a.score === null || a.score >= POOR) continue;
    const urls = (a.details?.items ?? []).map((i) => i.url).filter(Boolean);
    out.push({
      ...base,
      rule: `lighthouse:${id}`,
      message: `${label} is poor on ${path}${a.displayValue ? ` (${a.displayValue})` : ''}`,
      repro,
      evidence: urls.length ? { log: urls.slice(0, 20).join('\n') } : undefined,
    });
  }
  return out;
}

export const lighthouse: Tester = {
  name: 'lighthouse',
  needsLiveApp: true,
  async run(ctx) {
    if (!ctx.fullScan) skip('Lighthouse runs on full scans only');
    if (!ctx.baseUrl) skip('no app or live URL to test');
    try {
      await ctx.ready;
    } catch {
      skip('app is not reachable (reported by the playwright tester)');
    }
    const pages = (await ctx.crawled).slice(0, MAX_PAGES);
    if (pages.length === 0) skip('no pages were crawled');

    const port = await freePort();
    const findings: RawFinding[] = [];
    let browser: Browser | undefined;
    try {
      // Playwright's Chromium, exposed over CDP so Lighthouse can drive it.
      browser = await chromium.launch({ headless: true, args: [`--remote-debugging-port=${port}`] });
      for (const url of pages) {
        if (ctx.signal.aborted) break;
        try {
          const result = await lighthouseRun(url, {
            port,
            output: 'json',
            logLevel: 'error',
            onlyCategories: ['performance'],
          });
          if (!result) continue;
          const u = new URL(url);
          const path = `${u.pathname}${u.search}`;
          findings.push(...mapLighthouse(result.lhr as unknown as Lhr, path, ctx.isLiveUrl ? url : path));
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
