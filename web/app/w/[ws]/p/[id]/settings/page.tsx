import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TriangleAlertIcon } from 'lucide-react';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ConfirmDelete } from '@/components/confirm-delete';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireUser } from '@/lib/server/auth';
import { uuidParam } from '@/lib/server/params';
import { deleteProject, updateProject } from '../../../actions';
import { ProjectForm } from '../../../project-form';

export const metadata: Metadata = { title: 'Project settings' };

export default async function ProjectSettingsPage({ params }: { params: Promise<{ ws: string; id: string }> }) {
  const raw = await params;
  const ws = uuidParam(raw.ws);
  const id = uuidParam(raw.id);
  const { supabase } = await requireUser();

  const [{ data: project, error }, { data: workspace }] = await Promise.all([
    supabase
      .from('projects')
      .select('name, repo_url, branch, live_url, start_cmd, port, schedule')
      .eq('id', id)
      .eq('workspace_id', ws)
      .maybeSingle(),
    supabase.from('workspaces').select('name').eq('id', ws).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  if (!project || !workspace) notFound();

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Breadcrumbs
          items={[
            { label: 'Workspaces', href: '/w' },
            { label: workspace.name, href: `/w/${ws}` },
            { label: project.name, href: `/w/${ws}/p/${id}` },
            { label: 'Settings' },
          ]}
        />
        <h1 className="text-xl font-semibold">Project settings</h1>
      </div>
      <Card>
        <CardContent>
          {/* Keyed on saved values so the form remounts with what was persisted after each save. */}
          <ProjectForm
            key={JSON.stringify(project)}
            action={updateProject.bind(null, ws, id)}
            initial={project}
            submitLabel="Save changes"
          />
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TriangleAlertIcon className="size-4" /> Delete project
          </CardTitle>
          <CardDescription>Removes the project with all of its scans and bugs. This cannot be undone.</CardDescription>
        </CardHeader>
        <CardContent>
          <ConfirmDelete
            label="Delete project"
            name={project.name}
            description="All scans and bugs for this project are deleted for everyone in the workspace. This cannot be undone."
            action={deleteProject.bind(null, ws, id)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
