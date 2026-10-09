'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangleIcon, ChevronDownIcon, PlayIcon } from 'lucide-react';
import { toast } from 'sonner';
import { RunStatusBadge, ScanBadge, TriggerBadge } from '@/components/run-badges';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { duration, relativeTime } from '@/lib/format';
import { createClient, subscribeAsUser } from '@/lib/supabase/client';
import { isActiveRun, type Run } from '@/lib/types';

const HISTORY_SIZE = 20;

function useLiveRuns(projectId: string, initial: Run[]) {
  const [runs, setRuns] = useState(() => new Map(initial.map((r) => [r.id, r])));
  const router = useRouter();

  useEffect(
    () =>
      subscribeAsUser(`runs:${projectId}`, (ch) =>
        ch.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'runs', filter: `project_id=eq.${projectId}` },
          (payload) => {
            const run = payload.new as Partial<Run>;
            // A finished run changes the server-rendered severity counts and health score.
            if (run.status === 'done' || run.status === 'failed') router.refresh();
            setRuns((prev) => {
              const next = new Map(prev);
              if (payload.eventType === 'DELETE') next.delete((payload.old as Run).id);
              else next.set((payload.new as Run).id, payload.new as Run);
              return next;
            });
          },
        ),
      ),
    [projectId, router],
  );

  const upsert = (run: Run) => setRuns((prev) => new Map(prev).set(run.id, run));
  const sorted = useMemo(
    () => [...runs.values()].sort((a, b) => b.id - a.id).slice(0, HISTORY_SIZE),
    [runs],
  );
  return { runs: sorted, upsert };
}

export function RunPanel({
  projectId,
  initialRuns,
  canRun,
  workerOnline,
  workerLastSeen,
}: {
  projectId: string;
  initialRuns: Run[];
  canRun: boolean;
  workerOnline: boolean;
  workerLastSeen: string | null;
}) {
  const { runs, upsert } = useLiveRuns(projectId, initialRuns);
  const [submitting, setSubmitting] = useState(false);
  const latest = runs[0];
  const active = runs.some(isActiveRun);

  async function runNow(full: boolean) {
    setSubmitting(true);
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, full }),
      });
      const body = (await res.json()) as { runId?: number; error?: string };
      if (!res.ok || !body.runId) throw new Error(body.error ?? 'Could not start a run');
      // Don't wait for Realtime to show the row.
      const { data } = await createClient().from('runs').select('*').eq('id', body.runId).single();
      if (data) upsert(data);
      toast.success(`Run #${body.runId} queued`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start a run');
    } finally {
      setSubmitting(false);
    }
  }

  const disabled = active || submitting;

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Runs</h2>
        {canRun ? (
        <div className="flex">
          <Button onClick={() => runNow(false)} disabled={disabled} className="rounded-r-none">
            <PlayIcon className="size-4" />
            {active ? 'Run in progress' : 'Run now'}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                disabled={disabled}
                className="rounded-l-none border-l border-primary-foreground/20 px-2"
                aria-label="More run options"
              >
                <ChevronDownIcon className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => runNow(true)}>Full scan</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        ) : (
          <span className="text-xs text-muted-foreground">Viewers can&apos;t start runs</span>
        )}
      </div>

      {!workerOnline && (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p>
            <span className="font-medium">No worker is running.</span>{' '}
            <span className="text-muted-foreground">
              Runs wait in the queue until one starts
              {workerLastSeen ? ` (last seen ${relativeTime(workerLastSeen)})` : ''}.
            </span>
          </p>
        </div>
      )}

      {latest && <LatestRun run={latest} />}

      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-3">
          <CardTitle className="text-sm">History</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {runs.length === 0 ? (
            <p className="px-6 py-6 text-sm text-muted-foreground">No runs yet. Click Run now to start one.</p>
          ) : (
            // From lg up this panel is the narrow right-hand column, so Scope and AI calls (also shown on
            // the latest-run card) are dropped there instead of scrolling the table sideways.
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-3 py-2 font-medium">Run</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 font-medium">Trigger</th>
                    <th className="hidden px-2 py-2 font-medium sm:table-cell lg:hidden">Scope</th>
                    <th className="px-2 py-2 text-right font-medium">New</th>
                    <th className="px-2 py-2 text-right font-medium">Fixed</th>
                    <th className="hidden py-2 pr-3 pl-2 text-right font-medium sm:table-cell">Duration</th>
                    <th className="hidden px-4 py-2 text-right font-medium md:table-cell lg:hidden">AI calls</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <span className="font-mono">#{r.id}</span>
                        <span className="block text-xs whitespace-nowrap text-muted-foreground">{relativeTime(r.created_at)}</span>
                      </td>
                      <td className="px-2 py-2">
                        <RunStatusBadge status={r.status} />
                      </td>
                      <td className="px-2 py-2">
                        <TriggerBadge trigger={r.trigger} />
                      </td>
                      <td className="hidden px-2 py-2 sm:table-cell lg:hidden">{r.full_scan ? 'Full' : 'Incremental'}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.bugs_new ?? '—'}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.bugs_fixed ?? '—'}</td>
                      <td className="hidden py-2 pr-3 pl-2 text-right tabular-nums sm:table-cell">
                        {duration(r.started_at, r.finished_at)}
                      </td>
                      <td className="hidden px-4 py-2 text-right md:table-cell lg:hidden">{aiCalls(r.ai_usage)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LatestRun({ run }: { run: Run }) {
  const testers = Object.entries((run.testers ?? {}) as Record<string, string>);
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
          <span>Latest run #{run.id}</span>
          <RunStatusBadge status={run.status} />
          <TriggerBadge trigger={run.trigger} />
          <ScanBadge full={run.full_scan} />
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm text-muted-foreground">
        <p>
          {run.status === 'queued' && `Queued ${relativeTime(run.created_at)}. Waiting for a worker…`}
          {run.status === 'running' && `Started ${relativeTime(run.started_at)}`}
          {(run.status === 'done' || run.status === 'failed') &&
            `Finished ${relativeTime(run.finished_at)} · ${run.bugs_new ?? 0} new, ${run.bugs_fixed ?? 0} fixed${
              aiCalls(run.ai_usage) === '—' ? '' : ` · AI calls: ${aiCalls(run.ai_usage)}`
            }`}
        </p>
        {testers.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {testers.map(([name, state]) => (
              <li key={name} className="rounded-md border px-2 py-0.5 text-xs">
                {name}: {state}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** ai_usage = { "<provider>:<model>": { calls, prompt_tokens, completion_tokens } } (Phase 3). */
function aiCalls(usage: Run['ai_usage']): string {
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) return '—';
  const byProvider = new Map<string, number>();
  for (const [key, v] of Object.entries(usage)) {
    const calls = typeof v === 'object' && v && 'calls' in v ? Number(v.calls) : 0;
    const provider = key.split(':')[0] ?? key;
    byProvider.set(provider, (byProvider.get(provider) ?? 0) + calls);
  }
  if (byProvider.size === 0) return '—';
  return [...byProvider].map(([p, n]) => `${p} ${n}`).join(' · ');
}
