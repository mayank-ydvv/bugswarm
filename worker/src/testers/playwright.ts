import { chromium, devices, type Browser, type BrowserContext, type Page } from 'playwright';
import type { Category, RawFinding, Tester, TesterContext } from '../types.ts';
import { skip } from './util.ts';

const MAX_PAGES_FULL = 50;
const MAX_PAGES_INCREMENTAL = 15;
const MAX_BUTTONS = 10;
const MOBILE_PAGES = 10;
const GOTO_TIMEOUT_MS = 15_000;
const SETTLE_MS = 500;

/** Never follow or click anything that could destroy data, end the session or spend money. */
export const DESTRUCTIVE = /log\s*-?\s*out|sign\s*-?\s*out|delete|remove|destroy|unsubscribe|deactivate|purchase|checkout|\bpay\b/i;
const SKIP_EXT = /\.(pdf|zip|gz|tgz|tar|rar|7z|png|jpe?g|gif|svg|webp|ico|mp4|webm|mov|mp3|wav|dmg|exe|msi|csv|xlsx?|docx?)$/i;

type Event = { kind: 'console' | 'pageerror' | 'response'; text: string; detail?: string };

/** Same-origin http(s) URL without its #hash, or null if it must not be crawled. */
export function crawlable(href: string, origin: string): string | null {
  let u: URL;
  try {
    u = new URL(href, origin);
  } catch {
    return null;
  }
  if (u.origin !== origin || (u.protocol !== 'http:' && u.protocol !== 'https:')) return null;
  u.hash = '';
  if (SKIP_EXT.test(u.pathname) || DESTRUCTIVE.test(u.pathname + u.search)) return null;
  return u.toString();
}

class Crawl {
  readonly findings: RawFinding[] = [];
  readonly events: Event[] = [];
  readonly origin: string;
  readonly ctx: TesterContext;
  private readonly referrer = new Map<string, string>();

  constructor(ctx: TesterContext) {
    this.ctx = ctx;
    this.origin = new URL(ctx.baseUrl!).origin;
  }

  /** Path for messages: stable across runs (the sandbox port changes every run). */
  path(url: string): string {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
  }

  /** Stored location: the full URL for a real site, the path for a sandboxed app. */
  location(url: string): string {
    return this.ctx.isLiveUrl ? url : this.path(url);
  }

  strip(text: string): string {
    return text.split(this.origin).join('');
  }

  setReferrer(url: string, from: string) {
    if (!this.referrer.has(url)) this.referrer.set(url, from);
  }

  openSteps(url: string): string[] {
    const from = this.referrer.get(url);
    return from
      ? [`Open ${this.location(from)}`, `Follow the link to ${this.path(url)}`]
      : [`Open ${this.location(url)}`];
  }

  async screenshot(page: Page): Promise<string | undefined> {
    try {
      const buf = await page.screenshot({ type: 'jpeg', quality: 60 });
      return await this.ctx.upload(buf, 'jpg');
    } catch {
      return undefined; // evidence is best-effort
    }
  }

  add(f: Omit<RawFinding, 'tester'>) {
    this.findings.push({ tester: 'playwright', ...f });
  }

  watch(page: Page) {
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const text = m.text();
      // Same-origin failed requests are reported from the response itself.
      if (text.startsWith('Failed to load resource')) return;
      this.events.push({ kind: 'console', text: this.strip(text) });
    });
    page.on('pageerror', (e) => {
      this.events.push({ kind: 'pageerror', text: this.strip(e.message), detail: this.strip(e.stack ?? '') });
    });
    page.on('response', (r) => {
      const req = r.request();
      if (r.status() < 400 || req.resourceType() === 'document' || !r.url().startsWith(this.origin)) return;
      this.events.push({ kind: 'response', text: `${req.method()} ${this.path(r.url())} returned HTTP ${r.status()}` });
    });
    page.on('dialog', (d) => void d.dismiss().catch(() => {}));
  }
}

function eventFinding(e: Event): { category: Category; rule: string; message: string } {
  if (e.kind === 'pageerror') return { category: 'logic', rule: 'uncaught-exception', message: `Uncaught error: ${e.text}` };
  if (e.kind === 'response') {
    const status = Number(/HTTP (\d+)/.exec(e.text)?.[1] ?? 0);
    return { category: status >= 500 ? 'logic' : 'ui', rule: `http-${status}`, message: e.text };
  }
  return { category: 'logic', rule: 'console-error', message: `Console error: ${e.text}` };
}

/** Report new errors once per (kind, text) on a page. */
function unique(events: Event[]): Event[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    const key = `${e.kind}|${e.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function visit(crawl: Crawl, page: Page, url: string): Promise<string[] | null> {
  const path = crawl.path(url);
  const mark = crawl.events.length;
  let status: number | undefined;
  try {
    const res = await page.goto(url, { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS });
    status = res?.status();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const timedOut = /timeout/i.test(msg);
    crawl.add({
      rule: timedOut ? 'page-timeout' : 'page-load-failed',
      category: timedOut ? 'performance' : 'logic',
      message: timedOut
        ? `Page ${path} did not finish loading within ${GOTO_TIMEOUT_MS / 1000}s`
        : `Page ${path} failed to load: ${crawl.strip(msg.split('\n')[0]!)}`,
      url: crawl.location(url),
      repro: crawl.openSteps(url),
    });
    return null;
  }
  await page.waitForTimeout(SETTLE_MS);

  if (status !== undefined && status >= 400) {
    crawl.add({
      rule: `http-${status}`,
      category: status >= 500 ? 'logic' : 'ui',
      message: `Page ${path} returns HTTP ${status}`,
      url: crawl.location(url),
      repro: crawl.openSteps(url),
      evidence: { screenshot: await crawl.screenshot(page) },
    });
    return null; // don't crawl error pages
  }

  const errors = unique(crawl.events.slice(mark));
  if (errors.length > 0) {
    const screenshot = await crawl.screenshot(page);
    for (const e of errors) {
      crawl.add({
        ...eventFinding(e),
        url: crawl.location(url),
        repro: [...crawl.openSteps(url), 'Open the browser console'],
        evidence: { screenshot, log: e.detail || e.text },
      });
    }
  }

  const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => (a as HTMLAnchorElement).href)).catch(() => []);
  await clickButtons(crawl, page, url);
  return hrefs;
}

async function buttonLabel(page: Page, i: number): Promise<string> {
  const b = page.locator('button, [role="button"], input[type="submit"], input[type="button"]').nth(i);
  const text = (await b.innerText({ timeout: 1_000 }).catch(() => '')).trim();
  const label =
    text ||
    (await b.getAttribute('aria-label').catch(() => null)) ||
    (await b.getAttribute('value').catch(() => null)) ||
    (await b.getAttribute('title').catch(() => null)) ||
    `button ${i + 1}`;
  return label.replace(/\s+/g, ' ').slice(0, 60);
}

async function clickButtons(crawl: Crawl, page: Page, url: string) {
  const buttons = page.locator('button, [role="button"], input[type="submit"], input[type="button"]');
  const count = Math.min(await buttons.count().catch(() => 0), 50);
  let clicked = 0;
  for (let i = 0; i < count && clicked < MAX_BUTTONS; i++) {
    if (crawl.ctx.signal.aborted) return;
    const b = buttons.nth(i);
    if (!(await b.isVisible().catch(() => false)) || (await b.isDisabled().catch(() => true))) continue;
    const label = await buttonLabel(page, i);
    if (DESTRUCTIVE.test(label)) continue;

    const mark = crawl.events.length;
    try {
      await b.click({ timeout: 2_000 });
    } catch {
      continue; // covered, detached, etc.
    }
    clicked++;
    await page.waitForTimeout(400);

    const errors = unique(crawl.events.slice(mark)).filter((e) => e.kind !== 'response' || /HTTP 5/.test(e.text));
    if (errors.length > 0) {
      const first = errors[0]!;
      crawl.add({
        rule: 'click-error',
        category: 'logic',
        message: `Clicking '${label}' throws: ${first.text}`,
        url: crawl.location(url),
        repro: [...crawl.openSteps(url), `Click '${label}'`, 'Open the browser console'],
        evidence: { screenshot: await crawl.screenshot(page), log: errors.map((e) => e.detail || e.text).join('\n\n') },
      });
    }
    if (page.url() !== url) {
      await page.goto(url, { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS }).catch(() => {});
    }
  }
}

async function mobilePass(crawl: Crawl, context: BrowserContext, urls: string[]) {
  const page = await context.newPage();
  for (const url of urls.slice(0, MOBILE_PAGES)) {
    if (crawl.ctx.signal.aborted) return;
    try {
      await page.goto(url, { waitUntil: 'load', timeout: GOTO_TIMEOUT_MS });
      await page.waitForTimeout(300);
      // Mobile emulation widens the layout viewport (and innerWidth) to fit wide content, so compare
      // against the device's real width instead.
      const inner = page.viewportSize()?.width ?? 390;
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
      if (scroll > inner + 1) {
        crawl.add({
          rule: 'mobile-overflow',
          category: 'ui',
          message: `Page ${crawl.path(url)} is wider than the screen on iPhone 13 (${scroll}px of content in a ${inner}px viewport)`,
          url: crawl.location(url),
          repro: [`Open ${crawl.location(url)} on a phone (390px wide)`, 'Scroll sideways'],
          evidence: { screenshot: await crawl.screenshot(page) },
        });
      }
    } catch {
      // load problems were already reported by the desktop pass
    }
  }
}

async function appDidNotStart(ctx: TesterContext, err: unknown): Promise<RawFinding[]> {
  const reason = err instanceof Error ? err.message : String(err);
  if (ctx.isLiveUrl) {
    return [
      {
        tester: 'playwright',
        rule: 'site-unreachable',
        category: 'logic',
        message: `The live site ${new URL(ctx.baseUrl!).origin} is not responding: ${reason}`,
        url: ctx.baseUrl!,
        repro: [`Open ${ctx.baseUrl}`],
      },
    ];
  }
  return [
    {
      tester: 'playwright',
      rule: 'app-start',
      category: 'logic',
      message: `The app does not start in a clean checkout: ${reason}`,
      evidence: { log: await ctx.appLogs().catch(() => '') },
      repro: ['Clone the repo and install dependencies', 'Run the project start command', 'Open the app in a browser'],
    },
  ];
}

export const playwright: Tester = {
  name: 'playwright',
  needsLiveApp: true,
  async run(ctx) {
    if (!ctx.baseUrl) skip('no app or live URL to test');
    try {
      await ctx.ready;
    } catch (err) {
      return appDidNotStart(ctx, err);
    }

    const crawl = new Crawl(ctx);
    const maxPages = ctx.fullScan ? MAX_PAGES_FULL : MAX_PAGES_INCREMENTAL;
    let browser: Browser | undefined;
    try {
      browser = await chromium.launch({ headless: true });
      const desktop = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } });
      const page = await desktop.newPage();
      crawl.watch(page);
      // Close popups opened by clicks; the crawler only follows its own tab.
      desktop.on('page', (p) => {
        if (p !== page) void p.close().catch(() => {});
      });

      // BFS: the queue is read by index (O(1) dequeue), `seen` is a Set.
      const start = crawlable(ctx.baseUrl, crawl.origin) ?? ctx.baseUrl;
      const queue: string[] = [start];
      const seen = new Set(queue);
      const visited: string[] = [];
      for (let head = 0; head < queue.length && visited.length < maxPages; head++) {
        if (ctx.signal.aborted) break;
        const url = queue[head]!;
        const hrefs = await visit(crawl, page, url);
        if (!hrefs) continue;
        visited.push(url);
        for (const href of hrefs) {
          const next = crawlable(href, crawl.origin);
          if (next && !seen.has(next)) {
            seen.add(next);
            crawl.setReferrer(next, url);
            queue.push(next);
          }
        }
      }
      await desktop.close();
      // Lighthouse and axe test the same pages.
      ctx.publishCrawl(visited);

      const mobile = await browser.newContext({ ...devices['iPhone 13'], ignoreHTTPSErrors: true });
      await mobilePass(crawl, mobile, visited);
      await mobile.close();
    } finally {
      await browser?.close().catch(() => {});
    }
    return crawl.findings;
  },
};
