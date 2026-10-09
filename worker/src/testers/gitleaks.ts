import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runContainer } from '../docker.ts';
import { LIMITS } from '../config.ts';
import type { RawFinding, Tester } from '../types.ts';
import { parseJson, skip, toRepoPath } from './util.ts';

// Default rules, minus dependencies and git internals.
const CONFIG = `title = "bugswarm"
[extend]
useDefault = true
[[allowlists]]
description = "dependencies and VCS metadata"
paths = ['''(^|/)node_modules/''', '''(^|/)\\.git/''', '''(^|/)\\.bugswarm-tests/''']
`;

interface Leak {
  RuleID: string;
  Description: string;
  File: string;
  StartLine: number;
}

/**
 * Only rule, file and line are kept. Secret, Match and the source line are dropped on purpose:
 * detected secret values are never stored or sent to an AI provider.
 */
export function mapGitleaks(leaks: Leak[]): RawFinding[] {
  return leaks.map((l) => ({
    tester: 'gitleaks',
    rule: l.RuleID,
    category: 'security' as const,
    message: `Hard-coded secret (${l.RuleID}): ${l.Description}`,
    file: toRepoPath(l.File, '/repo'),
    line: l.StartLine,
  }));
}

export const gitleaks: Tester = {
  name: 'gitleaks',
  needsLiveApp: false,
  async run(ctx) {
    if (!ctx.dir) skip('no repository');
    const cfgDir = await mkdtemp(join(tmpdir(), 'bs-gitleaks-'));
    try {
      await writeFile(join(cfgDir, 'gitleaks.toml'), CONFIG);
      // Scans the working tree (fast, and fixed = removed from the file). No network.
      const r = await runContainer({
        image: 'zricethezav/gitleaks:latest',
        args: [
          'dir', '/repo',
          '--config', '/cfg/gitleaks.toml',
          '--report-format', 'json',
          '--report-path', '-',
          '--redact',
          '--no-banner',
          '--exit-code', '0',
          '--log-level', 'error',
        ],
        mounts: [
          { host: ctx.dir, container: '/repo', readOnly: true },
          { host: cfgDir, container: '/cfg', readOnly: true },
        ],
        asHostUser: true,
        label: `${ctx.runId}-gitleaks`,
        timeoutMs: LIMITS.testerMs,
        signal: ctx.signal,
      });
      if (r.timedOut) throw new Error('gitleaks timed out');
      if (r.code !== 0) throw new Error(`gitleaks failed (${r.code}): ${r.stderr.slice(-1000)}`);
      return mapGitleaks(parseJson<Leak[]>(r.stdout.trim() || '[]', 'gitleaks'));
    } finally {
      await rm(cfgDir, { recursive: true, force: true });
    }
  },
};
