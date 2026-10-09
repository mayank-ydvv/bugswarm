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
  repro_steps: string[] | null;
  expected: string | null;
}

function location(b: PromptBug): string {
  if (b.file) return b.line ? `${b.file}:${b.line}` : b.file;
  return b.url ?? 'unknown';
}

/** The ready-to-paste Claude Code prompt shown on the bug detail page. */
export function buildPrompt(b: PromptBug): string {
  const parts = [
    `Bug: ${b.title}`,
    `Severity: ${b.severity} · Category: ${b.category} · Found by: ${b.tester}`,
    `Location: ${location(b)}`,
    '',
    `Problem: ${b.summary ?? b.technical ?? b.title}`,
  ];
  if (b.technical) parts.push(`Tool output: ${b.technical}`);
  if (b.snippet) parts.push('', 'Code:', '```', b.snippet, '```');
  if (b.repro_steps?.length) {
    parts.push('', 'Repro:', ...b.repro_steps.map((s, i) => `${i + 1}. ${s}`));
  }
  parts.push(
    `Expected: ${b.expected ?? 'No error, warning or failing check at this location.'}`,
    '',
    'Task: Find the root cause and fix it with the smallest change. Add a regression test that fails before the fix and passes after. Do not touch unrelated code. Summarize what you changed.',
  );
  return parts.join('\n');
}
