import type { Database } from './database.types';

type Tables = Database['public']['Tables'];
type Enums = Database['public']['Enums'];

export type Run = Tables['runs']['Row'];
export type Bug = Tables['bugs']['Row'];
export type Project = Tables['projects']['Row'];
export type Severity = Enums['severity'];
export type BugStatus = Enums['bug_status'];

export const SEVERITIES: readonly Severity[] = ['critical', 'high', 'medium', 'low'];

/** max(0, 100 − (10×critical + 4×high + 1×medium)) over open bugs. */
export function healthScore(counts: Partial<Record<Severity, number>>): number {
  const penalty = 10 * (counts.critical ?? 0) + 4 * (counts.high ?? 0) + (counts.medium ?? 0);
  return Math.max(0, 100 - penalty);
}

export const isActiveRun = (r: Pick<Run, 'status'>) => r.status === 'queued' || r.status === 'running';
