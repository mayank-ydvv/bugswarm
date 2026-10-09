import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FolderGitIcon, GlobeIcon, SettingsIcon } from 'lucide-react';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { NextRun } from '@/components/next-run';
import { SeverityDot } from '@/components/severity';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SCHEDULE_LABEL } from '@/lib/format';
import { requireUser } from '@/lib/server/auth';
import { uuidParam } from '@/lib/server/params';
import { healthScore, SEVERITIES, type Severity } from '@/lib/types';
import { cn } from '@/lib/utils';
import { bugPageQuery, DEFAULT_FILTERS } from '@/lib/bugs';
import { BugList } from './bug-list';
import { RunPanel } from './run-panel';

export default async function ProjectPage({ params }: { params: Promise<{ ws: string; id: string }> }) {
  const raw = await params;
  const ws = uuidParam(raw.ws);
  const id = uuidParam(raw.id);
  const { supabase } = await requireUser();

  const [project, workspace, runs, counts, bugs, worker] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, repo_url, branch, live_url, schedule')
      .eq('id', id)
      .eq('workspace_id', ws)
      .maybeSingle(),
    supabase.from('workspaces').select('name').eq('id', ws).maybeSingle(),
    supabase.from('runs').select('*').eq('project_id', id).order('id', { ascending: false }).limit(20),
    supabase.from('project_bug_counts').select('severity, open_count').eq('project_id', id),
    // Default view: open, critical -> low, newest first. Enum order makes `severity asc` the rank.
    bugPageQuery(supabase, id, DEFAULT_FILTERS, null),
    supabase.from('worker_status').select('online, last_seen_at').maybeSingle(),
  ]);
  for (const r of [project, workspace, runs, counts, bugs]) if (r.error) throw new Error(r.error.message);
  if (!project.data || !workspace.data) notFound();

  const p = project.data;
  const bySeverity = new Map<Severity, number>();
  for (const c of counts.data ?? []) if (c.severity) bySeverity.set(c.severity, c.open_count ?? 0);
  const health = healthScore(Object.fromEntries(bySeverity));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Breadcrumbs
            items={[
              { label: 'Workspaces', href: '/w' },
              { label: workspace.data.name, href: `/w/${ws}` },
              { label: p.name },
            ]}
          />
          <h1 className="truncate text-xl font-semibold">{p.name}</h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {p.repo_url && (
              <a href={p.repo_url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1.5 hover:text-foreground">
                <FolderGitIcon className="size-3.5 shrink-0" />
                <span className="truncate">
                  {p.repo_url.replace(/^https?:\/\/(www\.)?/, '')} · {p.branch}
                </span>
              </a>
            )}
            {p.live_url && (
              <a href={p.live_url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1.5 hover:text-foreground">
                <GlobeIcon className="size-3.5 shrink-0" />
                <span className="truncate">{p.live_url}</span>
              </a>
            )}
            <span>
              {SCHEDULE_LABEL[p.schedule]} · <NextRun schedule={p.schedule} />
            </span>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/w/${ws}/p/${id}/settings`}>
            <SettingsIcon className="size-4" />
            Settings
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card className="col-span-2 gap-1 py-4 sm:col-span-1">
          <CardContent className="px-4">
            <p className="text-xs text-muted-foreground">Health</p>
            <p
              className={cn(
                'text-2xl font-semibold tabular-nums',
                health >= 80 ? 'text-emerald-600 dark:text-emerald-400' : health >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400',
              )}
            >
              {health}
            </p>
          </CardContent>
        </Card>
        {SEVERITIES.map((s) => (
          <Card key={s} className="gap-1 py-4">
            <CardContent className="px-4">
              <p className="flex items-center gap-1.5 text-xs capitalize text-muted-foreground">
                <SeverityDot severity={s} />
                {s}
              </p>
              <p className="text-2xl font-semibold tabular-nums">{bySeverity.get(s) ?? 0}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="text-base font-semibold">Bugs</h2>
          <BugList projectId={id} workspaceId={ws} initial={bugs.data ?? []} />
        </section>
        <section className="min-w-0">
          <RunPanel
            projectId={id}
            initialRuns={runs.data ?? []}
            workerOnline={worker.data?.online ?? false}
            workerLastSeen={worker.data?.last_seen_at ?? null}
          />
        </section>
      </div>
    </div>
  );
}
