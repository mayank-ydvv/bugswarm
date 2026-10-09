'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ProjectInput } from '@/lib/schemas';
import { requireUser } from '@/lib/server/auth';

export type ProjectFormState = { error?: string; ok?: boolean };

function parseProject(form: FormData) {
  return ProjectInput.safeParse({
    name: form.get('name'),
    repo_url: form.get('repo_url') ?? '',
    branch: form.get('branch') || undefined,
    live_url: form.get('live_url') ?? '',
    start_cmd: form.get('start_cmd') || undefined,
    port: form.get('port') || undefined,
    schedule: form.get('schedule') || undefined,
  });
}

function firstIssue(error: z.ZodError) {
  const issue = error.issues[0];
  return issue ? `${issue.path.join('.') || 'input'}: ${issue.message}` : 'Invalid input';
}

export async function createProject(
  workspaceId: string,
  _prev: ProjectFormState,
  form: FormData,
): Promise<ProjectFormState> {
  const ws = z.uuid().safeParse(workspaceId);
  const parsed = parseProject(form);
  if (!ws.success) return { error: 'Unknown workspace' };
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from('projects')
    .insert({ ...parsed.data, workspace_id: ws.data })
    .select('id')
    .single();
  if (error) return { error: error.message };
  redirect(`/w/${ws.data}/p/${data.id}`);
}

export async function updateProject(
  workspaceId: string,
  projectId: string,
  _prev: ProjectFormState,
  form: FormData,
): Promise<ProjectFormState> {
  const ids = z.object({ ws: z.uuid(), p: z.uuid() }).safeParse({ ws: workspaceId, p: projectId });
  const parsed = parseProject(form);
  if (!ids.success) return { error: 'Unknown project' };
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from('projects')
    .update(parsed.data)
    .eq('id', ids.data.p)
    .eq('workspace_id', ids.data.ws)
    .select('id');
  if (error) return { error: error.message };
  // RLS filters rows silently, so an empty result means "not allowed" (e.g. viewer role).
  if (data.length === 0) return { error: 'You do not have permission to edit this project' };

  revalidatePath(`/w/${ids.data.ws}/p/${ids.data.p}`, 'layout');
  return { ok: true };
}
