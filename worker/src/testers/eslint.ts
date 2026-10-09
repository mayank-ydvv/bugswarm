import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Category, RawFinding, Tester } from '../types.ts';
import { existingChanged, GENERATED_TESTS_DIR, JS_EXTS, parseJson, readSnippet, skip, toRepoPath } from './util.ts';

interface EslintMessage {
  ruleId: string | null;
  severity: number;
  message: string;
  line?: number;
  fatal?: boolean;
}
interface EslintFile {
  filePath: string;
  messages: EslintMessage[];
}

function category(ruleId: string | null): Category {
  if (!ruleId) return 'logic';
  if (/jsx-a11y/.test(ruleId)) return 'accessibility';
  if (/security|no-eval|no-implied-eval|no-new-func|no-script-url/.test(ruleId)) return 'security';
  if (/@typescript-eslint\/(no-explicit-any|no-unsafe|ban-ts)/.test(ruleId)) return 'type';
  return 'logic';
}

/** Errors only: warnings are style noise for a bug list. Fatal parse errors are always kept. */
export function mapEslint(files: EslintFile[], dir: string): RawFinding[] {
  const out: RawFinding[] = [];
  for (const f of files) {
    const file = toRepoPath(f.filePath, '/app');
    for (const m of f.messages) {
      if (m.severity < 2 && !m.fatal) continue;
      const rule = m.ruleId ?? 'parse-error';
      out.push({
        tester: 'eslint',
        rule,
        category: category(m.ruleId),
        message: `${m.message} (${rule})`,
        file,
        line: m.line,
        evidence: { snippet: readSnippet(dir, file, m.line) },
      });
    }
  }
  return out;
}

export const eslint: Tester = {
  name: 'eslint',
  needsLiveApp: false,
  async run(ctx) {
    if (!ctx.dir) skip('no repository');
    if (!ctx.installed || !existsSync(join(ctx.dir, 'node_modules/.bin/eslint'))) {
      skip('ESLint is not installed in this project');
    }
    const targets = ctx.fullScan ? ['.'] : existingChanged(ctx.dir, ctx.changed, JS_EXTS);
    if (targets.length === 0) return [];

    const r = await ctx.exec(['node_modules/.bin/eslint', '-f', 'json', '--no-error-on-unmatched-pattern', '--ignore-pattern', `${GENERATED_TESTS_DIR}/**`, '--', ...targets]);
    if (r.timedOut) throw new Error('eslint timed out');
    // 0 = clean, 1 = lint errors, 2 = crash / config problem.
    if (r.code === 2 || !r.stdout.trim().startsWith('[')) {
      if (/config/i.test(r.stderr)) skip('no usable ESLint config');
      throw new Error(`eslint failed: ${r.stderr.slice(-1000)}`);
    }
    return mapEslint(parseJson<EslintFile[]>(r.stdout, 'eslint'), ctx.dir);
  },
};
