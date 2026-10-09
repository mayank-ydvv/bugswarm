import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { RawFinding, Tester } from '../types.ts';
import { readSnippet, skip, toRepoPath } from './util.ts';

const LINE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;

/** Parse `tsc --pretty false` output. Indented continuation lines belong to the previous error. */
export function parseTsc(output: string, dir: string): RawFinding[] {
  const out: RawFinding[] = [];
  for (const raw of output.split('\n')) {
    const line = raw.trimEnd();
    const m = LINE.exec(line);
    if (m) {
      const [, path, ln, , code, message] = m;
      const file = toRepoPath(path!, '/app');
      out.push({
        tester: 'tsc',
        rule: code!,
        category: 'type',
        message: `${message} (${code})`,
        file,
        line: Number(ln),
        evidence: { snippet: readSnippet(dir, file, Number(ln)) },
      });
    } else if (/^\s+\S/.test(line) && out.length > 0) {
      const last = out[out.length - 1]!;
      last.evidence = { ...last.evidence, log: `${last.evidence?.log ?? ''}${line.trim()}\n` };
    }
  }
  return out;
}

export const tsc: Tester = {
  name: 'tsc',
  needsLiveApp: false,
  async run(ctx) {
    if (!ctx.dir) skip('no repository');
    if (!existsSync(join(ctx.dir, 'tsconfig.json'))) skip('no tsconfig.json');
    if (!ctx.installed || !existsSync(join(ctx.dir, 'node_modules/.bin/tsc'))) {
      skip('TypeScript is not installed in this project');
    }
    // The type graph spans files, so tsc always checks the whole project. The repo is mounted
    // read-only, so incremental build info must not be written.
    const r = await ctx.exec(['node_modules/.bin/tsc', '--noEmit', '--pretty', 'false', '--incremental', 'false']);
    if (r.timedOut) throw new Error('tsc timed out');
    const findings = parseTsc(r.stdout, ctx.dir);
    if (r.code !== 0 && findings.length === 0) throw new Error(`tsc failed: ${(r.stdout + r.stderr).slice(-1000)}`);
    return findings;
  },
};
