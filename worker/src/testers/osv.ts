import { runContainer } from '../docker.ts';
import { LIMITS } from '../config.ts';
import type { RawFinding, Tester } from '../types.ts';
import { parseJson, skip, toRepoPath } from './util.ts';

const LOCKFILE = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|requirements\.txt|poetry\.lock|Pipfile\.lock|go\.sum|Cargo\.lock|Gemfile\.lock|composer\.lock)$/;

interface OsvPackage {
  package: { name: string; version: string; ecosystem: string };
  vulnerabilities?: { id: string; summary?: string; aliases?: string[] }[];
  groups?: { ids: string[]; aliases?: string[]; max_severity?: string }[];
}
interface OsvOutput {
  results?: { source: { path: string }; packages: OsvPackage[] }[];
}

/** One finding per vulnerable package. The message avoids IDs so a version bump keeps the same bug. */
export function mapOsv(out: OsvOutput): RawFinding[] {
  const findings: RawFinding[] = [];
  for (const result of out.results ?? []) {
    const file = toRepoPath(result.source.path, '/src');
    for (const p of result.packages) {
      const vulns = p.vulnerabilities ?? [];
      if (vulns.length === 0) continue;
      const groups = p.groups ?? [];
      const maxCvss = Math.max(0, ...groups.map((g) => Number(g.max_severity) || 0));
      const n = groups.length || vulns.length;
      const log = vulns
        .map((v) => `${[v.id, ...(v.aliases ?? []).filter((a) => a.startsWith('CVE-'))].join(' / ')}: ${v.summary ?? ''}`)
        .join('\n');
      findings.push({
        tester: 'osv',
        rule: `osv:${p.package.ecosystem}/${p.package.name}`,
        category: 'dependency',
        message: `${p.package.name}@${p.package.version} has ${n} known ${n === 1 ? 'vulnerability' : 'vulnerabilities'}${maxCvss ? ` (max CVSS ${maxCvss})` : ''}`,
        file,
        evidence: { log },
      });
    }
  }
  return findings;
}

export const osv: Tester = {
  name: 'osv',
  needsLiveApp: false,
  async run(ctx) {
    if (!ctx.dir) skip('no repository');
    if (!ctx.fullScan && !ctx.changed.some((f) => LOCKFILE.test(f))) skip('no lockfile changes');

    const r = await runContainer({
      image: 'ghcr.io/google/osv-scanner:latest',
      args: ['scan', 'source', '-r', '--format', 'json', '--allow-no-lockfiles', '/src'],
      network: 'bridge', // queries the OSV database
      mounts: [{ host: ctx.dir, container: '/src', readOnly: true }],
      env: { HOME: '/tmp' },
      asHostUser: true,
      label: `${ctx.runId}-osv`,
      timeoutMs: LIMITS.testerMs,
      signal: ctx.signal,
    });
    if (r.timedOut) throw new Error('osv-scanner timed out');
    // 0 = clean, 1 = vulnerabilities found, 128 = no packages found.
    if (r.code === 128) return [];
    if ((r.code !== 0 && r.code !== 1) || !r.stdout.trim()) {
      throw new Error(`osv-scanner failed (${r.code}): ${r.stderr.slice(-1000)}`);
    }
    return mapOsv(parseJson<OsvOutput>(r.stdout, 'osv-scanner'));
  },
};
