import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, normalize, posix } from 'node:path';
import { runOk } from '../exec.ts';

export const SOURCE_EXT = /\.(c|m)?(j|t)sx?$/;
const EXCLUDED = /(^|\/)(node_modules|dist|build|out|coverage|vendor|\.next|\.bugswarm-tests)\//;
const TEST_FILE = /(^|\/)(__tests__|tests?)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
export const MAX_FILE_BYTES = 40_000;

export const isSource = (f: string) =>
  SOURCE_EXT.test(f) && !EXCLUDED.test(f) && !TEST_FILE.test(f) && !/\.min\.js$|\.d\.ts$/.test(f);

/** Tracked source files (untracked build output and generated files are ignored). */
export async function trackedSourceFiles(dir: string): Promise<string[]> {
  const out = await runOk('git', ['-C', dir, 'ls-files', '-z'], { timeoutMs: 60_000 });
  return out.split('\0').filter((f) => f && isSource(f)).sort();
}

const IMPORT_RE =
  /(?:import|export)\s[^'"`;]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)|require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)|import\s+['"](\.{1,2}\/[^'"]+)['"]/g;
const RESOLVE_SUFFIXES = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '/index.ts', '/index.tsx', '/index.js'];

/** Repo-relative paths of the files this file imports with relative specifiers. */
export function directImports(dir: string, file: string, content: string): string[] {
  const found = new Set<string>();
  for (const m of content.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2] ?? m[3] ?? m[4];
    if (!spec) continue;
    const base = posix.normalize(posix.join(posix.dirname(file), spec));
    // TS ESM code imports './x.js' for './x.ts'.
    const candidates = [base, base.replace(/\.js$/, '.ts'), base.replace(/\.js$/, '.tsx')];
    outer: for (const c of candidates) {
      for (const suffix of RESOLVE_SUFFIXES) {
        const rel = c + suffix;
        const abs = join(dir, rel);
        if (!normalize(abs).startsWith(normalize(dir))) continue;
        if (existsSync(abs) && statSync(abs).isFile() && isSource(rel)) {
          found.add(rel);
          break outer;
        }
      }
    }
  }
  return [...found];
}

export interface SourceFile {
  path: string;
  content: string;
}

/** Read files that exist and are small enough to send to a model. */
export async function readSources(dir: string, paths: string[]): Promise<SourceFile[]> {
  const out: SourceFile[] = [];
  for (const path of paths) {
    try {
      const abs = join(dir, path);
      if (statSync(abs).size > MAX_FILE_BYTES) continue;
      out.push({ path, content: await readFile(abs, 'utf8') });
    } catch {
      // deleted or unreadable
    }
  }
  return out;
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export function numbered(content: string): string {
  return content
    .split('\n')
    .map((l, i) => `${i + 1}: ${l}`)
    .join('\n');
}

export function relativeImport(fromDir: string, file: string): string {
  const rel = posix.relative(fromDir, file);
  return rel.startsWith('.') ? rel : `./${rel}`;
}

export { dirname };
