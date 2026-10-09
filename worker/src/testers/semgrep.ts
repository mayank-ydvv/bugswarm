import { runContainer } from '../docker.ts';
import { LIMITS } from '../config.ts';
import type { RawFinding, Tester } from '../types.ts';
import { existingChanged, GENERATED_TESTS_DIR, parseJson, readSnippet, skip, toRepoPath } from './util.ts';

interface SemgrepResult {
  check_id: string;
  path: string;
  start: { line: number };
  extra: { message: string; severity?: string };
}

export function mapSemgrep(results: SemgrepResult[], dir: string): RawFinding[] {
  return results.map((r) => {
    const file = toRepoPath(r.path, '/src');
    const rule = r.check_id;
    // Never keep the matched line of a secrets rule, even redacted.
    const snippet = /secret|token|credential|password|private-key/i.test(rule) ? undefined : readSnippet(dir, file, r.start.line);
    return {
      tester: 'semgrep',
      rule,
      category: 'security' as const,
      message: `${r.extra.message.trim()} (${rule.split('.').pop()})`,
      file,
      line: r.start.line,
      evidence: { snippet },
    };
  });
}

export const semgrep: Tester = {
  name: 'semgrep',
  needsLiveApp: false,
  async run(ctx) {
    if (!ctx.dir) skip('no repository');
    const targets = ctx.fullScan ? ['.'] : existingChanged(ctx.dir, ctx.changed);
    if (targets.length === 0) return [];

    // Network is needed to download the ruleset; the repo is mounted read-only.
    const r = await runContainer({
      image: 'semgrep/semgrep:latest',
      args: ['semgrep', 'scan', '--config', ctx.semgrepConfig, '--json', '--metrics=off', '--quiet', '--exclude', GENERATED_TESTS_DIR, '--', ...targets],
      network: 'bridge',
      mounts: [{ host: ctx.dir, container: '/src', readOnly: true }],
      workdir: '/src',
      env: { HOME: '/tmp', SEMGREP_SEND_METRICS: 'off' },
      asHostUser: true,
      label: `${ctx.runId}-semgrep`,
      timeoutMs: LIMITS.testerMs,
      signal: ctx.signal,
    });
    if (r.timedOut) throw new Error('semgrep timed out');
    if (!r.stdout.trim().startsWith('{')) throw new Error(`semgrep failed (${r.code}): ${r.stderr.slice(-1000)}`);
    const out = parseJson<{ results: SemgrepResult[] }>(r.stdout, 'semgrep');
    return mapSemgrep(out.results ?? [], ctx.dir);
  },
};
