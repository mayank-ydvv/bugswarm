import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ExternalLinkIcon } from 'lucide-react';
import { z } from 'zod';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { SeverityDot } from '@/components/severity';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { bugLocation, githubBlobUrl, statusText } from '@/lib/bugs';
import { relativeTime } from '@/lib/format';
import { requireUser } from '@/lib/server/auth';
import { uuidParam } from '@/lib/server/params';
import { canWrite, myRole } from '@/lib/server/role';
import type { Severity } from '@/lib/types';
import { cn } from '@/lib/utils';
import { StatusButtons, StatusSelect } from './bug-actions';
import { CopyPromptButton, MarkOpened } from './copy-prompt';

export const metadata: Metadata = { title: 'Bug' };

interface Evidence {
  snippet?: string;
  log?: string;
  screenshot?: string;
  video?: string;
}

const SEVERITY_TEXT: Record<Severity, string> = {
  critical: 'text-red-600 dark:text-red-400',
  high: 'text-orange-600 dark:text-orange-400',
  medium: 'text-amber-600 dark:text-amber-400',
  low: 'text-muted-foreground',
};

export default async function BugPage({ params }: { params: Promise<{ ws: string; id: string; bug: string }> }) {
  const raw = await params;
  const ws = uuidParam(raw.ws);
  const projectId = uuidParam(raw.id);
  const bugId = z.coerce.number().int().positive().safeParse(raw.bug);
  if (!bugId.success) notFound();
  const { supabase, userId } = await requireUser();

  const [{ data: bug, error }, { data: project }, { data: workspace }] = await Promise.all([
    supabase.from('bugs').select('*').eq('id', bugId.data).eq('project_id', projectId).maybeSingle(),
    supabase.from('projects').select('name, repo_url').eq('id', projectId).eq('workspace_id', ws).maybeSingle(),
    supabase.from('workspaces').select('name').eq('id', ws).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  if (!bug || !project || !workspace) notFound();
  const writable = canWrite(await myRole(supabase, ws, userId));

  const runIds = [bug.first_seen_run, bug.last_seen_run, bug.fixed_run, bug.verified_run].filter(
    (r): r is number => r !== null,
  );
  const { data: runs } = await supabase
    .from('runs')
    .select('id, created_at, commit_sha, trigger, full_scan')
    .in('id', runIds.length ? runIds : [-1]);
  const runById = new Map((runs ?? []).map((r) => [r.id, r]));
  const firstRun = bug.first_seen_run ? runById.get(bug.first_seen_run) : undefined;
  const lastRun = bug.last_seen_run ? runById.get(bug.last_seen_run) : undefined;

  const evidence = (bug.evidence ?? {}) as Evidence;
  // Signed URLs are checked against storage RLS: only members of the project's workspace get one.
  const signed = async (path?: string) =>
    path ? (await supabase.storage.from('evidence').createSignedUrl(path, 3600)).data?.signedUrl : undefined;
  const [screenshotUrl, videoUrl] = await Promise.all([signed(evidence.screenshot), signed(evidence.video)]);
  const blobUrl = githubBlobUrl(project.repo_url, lastRun?.commit_sha ?? null, bug.file, bug.line);
  const pageUrl = bug.url && /^https?:\/\//.test(bug.url) ? bug.url : null;
  const prompt = bug.fix_prompt ?? bug.technical ?? bug.title;

  return (
    <div className="flex flex-col gap-6 pb-20 sm:pb-0">
      <MarkOpened projectId={projectId} bugId={bug.id} />
      <div className="flex flex-col gap-3">
        <Breadcrumbs
          items={[
            { label: 'Workspaces', href: '/w' },
            { label: workspace.name, href: `/w/${ws}` },
            { label: project.name, href: `/w/${ws}/p/${projectId}` },
            { label: `Bug #${bug.id}` },
          ]}
        />
        <h1 className="text-xl font-semibold text-balance">{bug.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={cn('flex items-center gap-1.5 font-medium capitalize', SEVERITY_TEXT[bug.severity])}>
            <SeverityDot severity={bug.severity} />
            {bug.severity}
          </span>
          <Badge variant="outline" className="capitalize">
            {bug.category}
          </Badge>
          <span className="text-muted-foreground">found by {bug.tester}</span>
          {!bug.explained && <Badge variant="secondary">Not explained yet</Badge>}
          <div className="ml-auto">
            {writable ? (
              <StatusSelect bugId={bug.id} status={bug.status} />
            ) : (
              <Badge variant="secondary">{statusText(bug)}</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Section title="What's wrong">
            <p className="text-sm leading-relaxed">{bug.summary ?? bug.technical ?? bug.title}</p>
            {bug.expected && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Expected: </span>
                {bug.expected}
              </p>
            )}
          </Section>

          <Section title="Where">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs break-all">{bugLocation(bug)}</code>
              {blobUrl && <ExtLink href={blobUrl}>View on GitHub</ExtLink>}
              {pageUrl && <ExtLink href={pageUrl}>Open page</ExtLink>}
            </div>
            {evidence.snippet && <Snippet text={evidence.snippet} />}
          </Section>

          {(screenshotUrl || videoUrl || evidence.log || bug.technical) && (
            <Section title="Evidence">
              {videoUrl && (
                <figure className="flex flex-col gap-1">
                  <video
                    src={videoUrl}
                    controls
                    muted
                    playsInline
                    preload="metadata"
                    className="max-h-96 w-full max-w-2xl rounded-md border bg-black"
                  />
                  <figcaption className="text-xs text-muted-foreground">Recording of the failing interaction</figcaption>
                </figure>
              )}
              {screenshotUrl && (
                <a href={screenshotUrl} target="_blank" rel="noreferrer" className="block w-fit">
                  {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                  <img src={screenshotUrl} alt="Screenshot taken when the bug happened" className="max-h-96 rounded-md border" />
                </a>
              )}
              {evidence.log && (
                <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
                  {evidence.log}
                </pre>
              )}
              {bug.technical && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Raw tool message</summary>
                  <pre className="mt-2 overflow-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
                    {bug.technical}
                  </pre>
                </details>
              )}
            </Section>
          )}

          {bug.repro_steps && bug.repro_steps.length > 0 && (
            <Section title="Steps to reproduce">
              <ol className="list-decimal space-y-1 pl-5 text-sm">
                {bug.repro_steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </Section>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card className="gap-3">
            <CardHeader>
              <CardTitle className="text-base">Fix with Claude Code</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <CopyPromptButton prompt={prompt} className="hidden sm:inline-flex" />
              <pre className="max-h-56 overflow-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                {prompt}
              </pre>
            </CardContent>
          </Card>

          {writable && (
            <Card className="gap-3">
              <CardHeader>
                <CardTitle className="text-base">Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <StatusButtons bugId={bug.id} status={bug.status} />
              </CardContent>
            </Card>
          )}

          <Card className="gap-3">
            <CardHeader>
              <CardTitle className="text-base">History</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1.5 text-sm">
              <HistoryRow label="First seen" run={firstRun} />
              <HistoryRow label="Last seen" run={lastRun} />
              {bug.fixed_run && <HistoryRow label="Fixed in" run={runById.get(bug.fixed_run)} />}
              {bug.verified_run && <HistoryRow label="Verified by" run={runById.get(bug.verified_run)} />}
              <p className={cn('text-muted-foreground', bug.status === 'verified' && 'text-emerald-600 dark:text-emerald-400')}>
                {statusText(bug)}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Sticky primary action on phones. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 backdrop-blur sm:hidden">
        <CopyPromptButton prompt={prompt} className="w-full" />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline">
      {children}
      <ExternalLinkIcon className="size-3.5" />
    </a>
  );
}

/** Snippet lines look like "> 12 | code"; the ">" line is the reported one. */
function Snippet({ text }: { text: string }) {
  return (
    <pre className="overflow-auto rounded-md border bg-muted/50 py-2 font-mono text-xs">
      {text.split('\n').map((line, i) => {
        const hit = line.startsWith('>');
        return (
          <div key={i} className={cn('px-3', hit && 'bg-amber-500/15 font-medium')}>
            {line.slice(2)}
          </div>
        );
      })}
    </pre>
  );
}

function HistoryRow({
  label,
  run,
}: {
  label: string;
  run?: { id: number; created_at: string; commit_sha: string | null };
}) {
  return (
    <p className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span>
        {run ? (
          <>
            run #{run.id} · {relativeTime(run.created_at)}
            {run.commit_sha && <code className="ml-1 font-mono text-xs">{run.commit_sha.slice(0, 7)}</code>}
          </>
        ) : (
          '—'
        )}
      </span>
    </p>
  );
}
