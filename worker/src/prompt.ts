export interface PromptBug {
  title: string;
  severity: string;
  category: string;
  tester: string;
  file: string | null;
  line: number | null;
  url: string | null;
  summary: string | null;
  technical: string | null;
  snippet?: string | null;
  /** Tool log from the evidence (already secret-redacted), e.g. the CVE list for a dependency. */
  log?: string | null;
  repro_steps: string[] | null;
  expected: string | null;
}

function location(b: PromptBug): string {
  if (b.file) return b.line ? `${b.file}:${b.line}` : b.file;
  return b.url ?? 'unknown';
}

const MAX_LOG = 2000;

const DEFAULT_TASK =
  'Task: Find the root cause and fix it with the smallest change. Add a regression test that fails before the fix and passes after. Do not touch unrelated code. Summarize what you changed.';
const DEPENDENCY_TASK =
  'Task: Upgrade this package (or the dependency that pulls it in) to a version without these vulnerabilities, with the smallest change to the manifest and lockfile. Reinstall and run the existing tests to confirm nothing breaks. Summarize what you changed.';

/** The ready-to-paste Claude Code prompt shown on the bug detail page. */
export function buildPrompt(b: PromptBug): string {
  const dependency = b.category === 'dependency';
  const problem = b.summary ?? b.technical ?? b.title;
  const parts = [
    `Bug: ${b.title}`,
    `Severity: ${b.severity} · Category: ${b.category} · Found by: ${b.tester}`,
    `Location: ${location(b)}`,
    '',
    `Problem: ${problem}`,
  ];
  if (b.technical && b.technical !== problem) parts.push(`Tool output: ${b.technical}`);
  if (b.log) {
    const log = b.log.length > MAX_LOG ? `${b.log.slice(0, MAX_LOG)}\n…` : b.log;
    parts.push('', 'Details:', '```', log, '```');
  }
  if (b.snippet) parts.push('', 'Code:', '```', b.snippet, '```');
  if (b.repro_steps?.length) {
    parts.push('', 'Repro:', ...b.repro_steps.map((s, i) => `${i + 1}. ${s}`));
  }
  const expected = dependency ? 'No known vulnerabilities in this dependency.' : 'No error, warning or failing check at this location.';
  parts.push(`Expected: ${b.expected ?? expected}`, '', dependency ? DEPENDENCY_TASK : DEFAULT_TASK);
  return parts.join('\n');
}
