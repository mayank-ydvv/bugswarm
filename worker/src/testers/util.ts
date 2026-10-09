import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { TesterSkipped } from '../types.ts';

export const JS_EXTS = /\.(c|m)?(j|t)sx?$/;

/** Scratch dir where test generation writes its tests; every other tester must ignore it. */
export const GENERATED_TESTS_DIR = '.bugswarm-tests';

export function skip(reason: string): never {
  throw new TesterSkipped(reason);
}

/** Map a path reported inside a container (e.g. /app/src/x.ts) back to a repo-relative path. */
export function toRepoPath(reported: string, containerRoot: string): string {
  const p = isAbsolute(reported) ? relative(containerRoot, reported) : reported;
  return p.replace(/^\.\//, '').split('\\').join('/');
}

/** Changed files that still exist (deleted files cannot be linted). */
export function existingChanged(dir: string, changed: string[], filter?: RegExp): string[] {
  return changed.filter((f) => (!filter || filter.test(f)) && existsSync(join(dir, f)));
}

const snippetCache = new Map<string, string[] | null>();

/** 5 lines centred on `line` (1-based), with a marker on the reported line. */
export function readSnippet(dir: string, file: string, line: number | undefined, radius = 2): string | undefined {
  if (!line || line < 1) return undefined;
  const key = join(dir, file);
  let lines = snippetCache.get(key);
  if (lines === undefined) {
    try {
      lines = readFileSync(key, 'utf8').split('\n');
    } catch {
      lines = null;
    }
    if (snippetCache.size > 2000) snippetCache.clear();
    snippetCache.set(key, lines);
  }
  if (!lines) return undefined;
  const start = Math.max(1, line - radius);
  const end = Math.min(lines.length, line + radius);
  const width = String(end).length;
  const out: string[] = [];
  for (let n = start; n <= end; n++) {
    out.push(`${n === line ? '>' : ' '} ${String(n).padStart(width)} | ${lines[n - 1] ?? ''}`);
  }
  return out.join('\n');
}

/** The snippet cache is per checkout; clear it between runs. */
export function resetSnippetCache() {
  snippetCache.clear();
}

export function parseJson<T>(text: string, what: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${what}: could not parse JSON output: ${text.slice(0, 300)}`);
  }
}
