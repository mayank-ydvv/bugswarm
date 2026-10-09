import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BugIcon, FolderGitIcon, GlobeIcon, SettingsIcon } from 'lucide-react';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { EmptyState } from '@/components/empty-state';
import { RunStatusBadge } from '@/components/run-badges';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { relativeTime, SCHEDULE_LABEL } from '@/lib/format';
import { requireUser } from '@/lib/server/auth';
import { uuidParam } from '@/lib/server/params';
import { canWrite, myRole } from '@/lib/server/role';
import { AddProjectDialog } from './add-project-dialog';

export async function generateMetadata({ params }: { params: Promise<{ ws: string }> }): Promise<Metadata> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from('workspaces').select('name').eq('id', uuidParam((await params).ws)).maybeSingle();
  return { title: data?.name ?? 'Workspace' };
}

export default async function WorkspacePage({ params }: { params: Promise<{ ws: string }> }) {
  const ws = uuidParam((await params).ws);
  const { supabase, userId } = await requireUser();

  const [{ data: workspace }, { data: projects, error }] = await Promise.all([
    supabase.from('workspaces').select('id, name').eq('id', ws).maybeSingle(),
    supabase
      .from('project_summaries')
      .select('id, name, repo_url, branch, live_url, schedule, open_bugs, last_run_status, last_run_at')
      .eq('workspace_id', ws)
      .order('created_at', { ascending: false }),
  ]);
  if (!workspace) notFound();
  const writable = canWrite(await myRole(supabase, ws, userId));
  if (error) throw new Error(error.message);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Breadcrumbs items={[{ label: 'Workspaces', href: '/w' }, { label: workspace.name }]} />
          <h1 className="truncate text-xl font-semibold">{workspace.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" asChild aria-label="Workspace settings">
            <Link href={`/w/${ws}/settings`}>
              <SettingsIcon className="size-4" />
            </Link>
          </Button>
          {writable && <AddProjectDialog workspaceId={ws} />}
        </div>
      </div>

      {projects.length === 0 ? (
        <EmptyState icon={FolderGitIcon} title="No projects yet">
          Add a GitHub repo or a live URL and BugSwarm starts testing it.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/w/${ws}/p/${p.id}`} className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring">
                <Card className="gap-3 transition-colors hover:bg-muted/50">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2">
                      <span className="truncate">{p.name}</span>
                      {p.last_run_status && <RunStatusBadge status={p.last_run_status} />}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-1.5 text-sm text-muted-foreground">
                    {p.repo_url && (
                      <span className="flex min-w-0 items-center gap-1.5">
                        <FolderGitIcon className="size-3.5 shrink-0" />
                        <span className="truncate">
                          {p.repo_url.replace(/^https?:\/\/(www\.)?/, '')} · {p.branch}
                        </span>
                      </span>
                    )}
                    {p.live_url && (
                      <span className="flex min-w-0 items-center gap-1.5">
                        <GlobeIcon className="size-3.5 shrink-0" />
                        <span className="truncate">{p.live_url}</span>
                      </span>
                    )}
                    <span className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <span className="flex items-center gap-1.5">
                        <BugIcon className="size-3.5" />
                        {p.open_bugs ?? 0} open
                      </span>
                      <span>
                        {p.schedule ? SCHEDULE_LABEL[p.schedule] : ''} · last run {relativeTime(p.last_run_at)}
                      </span>
                    </span>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
