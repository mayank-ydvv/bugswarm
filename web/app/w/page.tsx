import Link from 'next/link';
import type { Metadata } from 'next';
import { BugIcon, FolderKanbanIcon } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { relativeTime } from '@/lib/format';
import { requireUser } from '@/lib/server/auth';
import { CreateWorkspaceDialog } from './create-workspace-dialog';

export const metadata: Metadata = { title: 'Workspaces' };

export default async function WorkspacesPage() {
  const { supabase } = await requireUser();
  const { data: workspaces, error } = await supabase
    .from('workspace_summaries')
    .select('id, name, open_bugs, last_run_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Workspaces</h1>
        <CreateWorkspaceDialog />
      </div>
      {workspaces.length === 0 ? (
        <EmptyState icon={FolderKanbanIcon} title="No workspaces yet">
          Create a workspace, then add a project to start testing it.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((w) => (
            <li key={w.id}>
              <Link href={`/w/${w.id}`} className="block rounded-xl focus-visible:ring-2 focus-visible:ring-ring">
                <Card className="transition-colors hover:bg-muted/50">
                  <CardHeader>
                    <CardTitle className="truncate">{w.name}</CardTitle>
                    <CardDescription className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5">
                        <BugIcon className="size-3.5" />
                        {w.open_bugs ?? 0} open
                      </span>
                      <span>Last run {relativeTime(w.last_run_at)}</span>
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
