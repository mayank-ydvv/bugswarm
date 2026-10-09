import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { AiUnavailable } from '../ai.ts';
import { redactSecrets } from '../normalize.ts';
import type { RawFinding, Tester } from '../types.ts';
import { isSource, readSources, relativeImport, sha256, trackedSourceFiles } from './source.ts';
import { GENERATED_TESTS_DIR, skip } from './util.ts';

export const TESTGEN_PROMPT_VERSION = 'testgen-v1';
const MAX_TOOL_FINDINGS = 10;

export type Runner = 'vitest' | 'jest' | 'node';

interface PackageJson {
  type?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export function detectRunner(pkg: PackageJson): Runner {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps.vitest) return 'vitest';
  if (deps.jest) return 'jest';
  return 'node';
}

export const TESTGEN_SYSTEM = `You write focused unit tests that expose real bugs.
Given one source file, write tests for its exported functions that assert the behaviour the code is
clearly meant to have (from names, comments and logic). Prefer simple, deterministic inputs. Do not
test private helpers, do not mock the module under test, do not use network, timers or the file system.
Return ONLY JSON: {"tests": string} where "tests" is the complete test file content.
Return {"tests": ""} if the file exports nothing testable.`;

function userPrompt(runner: Runner, moduleType: string, importPath: string, f: { path: string; content: string }) {
  const style =
    runner === 'node'
      ? `Use node:test (import { test } from 'node:test') and node:assert/strict.`
      : runner === 'vitest'
        ? `Use vitest (import { test, expect } from 'vitest').`
        : `Use jest globals (test, expect).`;
  return JSON.stringify({
    runner,
    instructions: `${style} The test file uses ${moduleType === 'module' ? 'ES modules (import)' : 'CommonJS (require)'}. Import the module under test from '${importPath}'.`,
    path: f.path,
    import_path: importPath,
    code: redactSecrets(f.content),
  });
}

const Generated = z.object({ tests: z.string().default('') });

export interface TestFailure {
  /** Test file path as the runner reported it. */
  file: string;
  name: string;
  error: string;
  log: string;
}

/** Failures that come from a broken generated test rather than from the code under test. */
const INVALID_TEST =
  /SyntaxError|ERR_MODULE_NOT_FOUND|ERR_UNKNOWN_FILE_EXTENSION|ERR_REQUIRE_ESM|Cannot find module|does not provide an export named|is not exported|Unexpected token/;

/**
 * node:test reports a test file that crashes while loading (a bad import, an unsupported file type) as
 * one failure named after the file itself, with the real error only on stderr. That says nothing
 * about the code under test, so it must never become a bug.
 */
export function isLoadFailure(f: TestFailure, testFile: string): boolean {
  return f.name.endsWith(testFile) || INVALID_TEST.test(f.error);
}

/** Node's TAP reporter: `not ok N - name` followed by an indented YAML block. */
export function parseTap(output: string): TestFailure[] {
  const lines = output.split('\n');
  const out: TestFailure[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)not ok \d+ - (.*)$/.exec(lines[i]!);
    if (!m) continue;
    const indent = m[1]!.length;
    const block: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j]!;
      if (l.trim() === '...' && l.length - l.trimStart().length === indent + 2) break;
      if (/^\s*(not )?ok \d+ - /.test(l) && l.length - l.trimStart().length <= indent) break;
      block.push(l.slice(indent + 2));
    }
    const yaml = block.join('\n');
    if (/failureType: 'subtestsFailed'/.test(yaml)) continue; // parent of failing subtests
    const location = /location: '([^']+)'/.exec(yaml)?.[1] ?? '';
    const errName = /^name: '?([^'\n]+)'?$/m.exec(yaml)?.[1];
    let error = /^error: '((?:[^']|'')*)'$/m.exec(yaml)?.[1]?.replace(/''/g, "'");
    if (error === undefined) {
      const blockStart = yaml.indexOf('error: |-');
      if (blockStart !== -1) {
        error = yaml
          .slice(blockStart + 'error: |-'.length)
          .split('\n')
          .slice(1)
          .filter((l) => l.startsWith('  '))
          .map((l) => l.trim())
          .filter(Boolean)
          .join(' ');
      }
    }
    const message = [errName && errName !== 'AssertionError' ? errName : '', error ?? 'test failed']
      .filter(Boolean)
      .join(': ');
    out.push({ file: location.replace(/:\d+:\d+$/, ''), name: m[2]!.trim(), error: message, log: yaml });
  }
  return out;
}

/** Vitest `--reporter=json` and Jest `--json` share this shape. */
export function parseJestJson(output: string): TestFailure[] {
  const start = output.indexOf('{');
  if (start === -1) return [];
  const report = JSON.parse(output.slice(start)) as {
    testResults?: { name: string; assertionResults?: { fullName?: string; title?: string; status: string; failureMessages?: string[] }[] }[];
  };
  const out: TestFailure[] = [];
  for (const file of report.testResults ?? []) {
    for (const a of file.assertionResults ?? []) {
      if (a.status !== 'failed') continue;
      const log = (a.failureMessages ?? []).join('\n');
      out.push({ file: file.name, name: a.fullName ?? a.title ?? 'test', error: log.split('\n')[0] ?? 'test failed', log });
    }
  }
  return out;
}

function runnerCommand(runner: Runner, files: string[]): string[] {
  if (runner === 'vitest') return ['node_modules/.bin/vitest', 'run', '--reporter=json', '--passWithNoTests', ...files];
  if (runner === 'jest') return ['node_modules/.bin/jest', '--json', '--runTestsByPath', '--rootDir=/app', ...files];
  return ['node', '--test', '--test-reporter=tap', ...files];
}

export const testgen: Tester = {
  name: 'testgen',
  needsLiveApp: false,
  async run(ctx) {
    if (!ctx.dir) skip('no repository');
    if (!ctx.ai.enabled) skip('AI is not configured');
    const dir = ctx.dir;

    let pkg: PackageJson;
    try {
      pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')) as PackageJson;
    } catch {
      skip('no package.json');
    }
    const runner = detectRunner(pkg);
    if (runner !== 'node' && !ctx.installed) skip(`${runner} is not installed`);
    const moduleType = pkg.type === 'module' ? 'module' : 'commonjs';

    // node:test on Node 20 cannot import TypeScript or JSX, so only plain JS is testable without a runner.
    const testable = (f: string) => isSource(f) && (runner !== 'node' || /\.(c|m)?js$/.test(f));
    const counts = await ctx.toolFindingCounts();
    const paths = (ctx.fullScan ? await trackedSourceFiles(dir) : ctx.changed)
      .filter(testable)
      .filter((f) => (counts.get(f) ?? 0) <= MAX_TOOL_FINDINGS);
    const sources = (await readSources(dir, paths))
      .filter((f) => /\bexport\b|module\.exports/.test(f.content))
      .slice(0, ctx.aiLimits.testgenMaxFiles);
    if (sources.length === 0) {
      ctx.setScope([]);
      return [];
    }

    const testDir = join(dir, GENERATED_TESTS_DIR);
    const ext = runner === 'node' ? (moduleType === 'module' ? '.test.mjs' : '.test.cjs') : '.test.ts';
    const keyed = sources.map((f, i) => {
      const testFile = `${GENERATED_TESTS_DIR}/${i}-${basename(f.path).replace(/\.[^.]+$/, '')}${ext}`;
      const importPath = relativeImport(GENERATED_TESTS_DIR, f.path);
      return {
        ...f,
        testFile,
        importPath,
        hash: sha256([TESTGEN_PROMPT_VERSION, runner, moduleType, f.path, f.content].join('\n')),
      };
    });

    const cached = await ctx.llmCache.get(keyed.map((k) => k.hash));
    const fresh: { hash: string; result: unknown }[] = [];
    const written = new Map<string, string>(); // test file -> source file
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });

    try {
      for (const k of keyed) {
        if (ctx.signal.aborted) break;
        let raw = cached.get(k.hash);
        if (raw === undefined) {
          try {
            raw = await ctx.ai.chatJSON('testgen', TESTGEN_SYSTEM, userPrompt(runner, moduleType, k.importPath, k), ctx.aiUsage);
          } catch (err) {
            if (err instanceof AiUnavailable) break;
            ctx.log(`${k.path}: ${err instanceof Error ? err.message : err}`);
            continue;
          }
          fresh.push({ hash: k.hash, result: raw });
        }
        const parsed = Generated.safeParse(raw);
        if (!parsed.success || !parsed.data.tests.trim()) continue;
        await writeFile(join(dir, k.testFile), parsed.data.tests);
        written.set(k.testFile, k.path);
      }
      await ctx.llmCache.put(fresh.filter((e) => Generated.safeParse(e.result).success));
      if (written.size === 0) {
        ctx.setScope([]);
        return [];
      }

      // Generated code runs only inside the sandbox: no network, resource limits, dropped capabilities.
      const r = await ctx.exec(runnerCommand(runner, [...written.keys()]), { writable: true });
      if (r.timedOut) throw new Error('generated tests timed out');
      const failures = runner === 'node' ? parseTap(r.stdout) : parseJestJson(r.stdout);

      const findings: RawFinding[] = [];
      const sourceOf = (reported: string) => {
        for (const [testFile, source] of written) if (reported.endsWith(testFile)) return { testFile, source };
        return undefined;
      };
      for (const f of failures) {
        const hit = sourceOf(f.file);
        if (!hit || isLoadFailure(f, hit.testFile)) continue;
        const testCode = await readFile(join(dir, hit.testFile), 'utf8').catch(() => '');
        findings.push({
          tester: 'testgen',
          rule: 'ai-testgen',
          category: 'logic',
          message: `Generated test "${f.name}" fails: ${f.error.slice(0, 300)}`,
          file: hit.source,
          repro: [
            `Save the generated test from the evidence as ${hit.testFile}`,
            `Run it with ${runner === 'node' ? 'node --test' : runner}`,
          ],
          evidence: { log: `${f.log}\n\n--- generated test (${hit.testFile}) ---\n${testCode}`.slice(0, 8000) },
        });
      }
      ctx.log(`${written.size} test file(s), ${failures.length} failing test(s), ${fresh.length} new AI call(s)`);
      ctx.setScope([...written.values()]);
      return findings;
    } finally {
      await rm(testDir, { recursive: true, force: true });
    }
  },
};
