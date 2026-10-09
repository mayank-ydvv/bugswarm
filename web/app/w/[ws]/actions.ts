'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { ProjectInput, WorkspaceInput } from '@/lib/schemas';
import { requireUser } from '@/lib/server/auth';

export type ProjectFormState = { error?: string; ok?: boolean; values?: Record<string, string> };

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

const FIELD_LABEL: Record<string, string> = {
  name: 'Name',
  repo_url: 'GitHub repo URL',
  branch: 'Branch',
  live_url: 'Live URL',
  start_cmd: 'Start command',
  port: 'Port',
  schedule: 'Schedule',
};

function firstIssue(error: z.ZodError) {
  const issue = error.issues[0];
  if (!issue) return 'Invalid input';
  // Cross-field rules (refine) already read as a sentence; field rules need the field's label.
  const label = FIELD_LABEL[String(issue.path[0])];
  return issue.code === 'custom' || !label ? issue.message : `${label}: ${issue.message}`;
}

/** Echo the submitted text back so a failed submit doesn't wipe the form (React resets it). */
function submitted(form: FormData) {
  const values: Record<string, string> = {};
  for (const [k, v] of form) if (typeof v === 'string' && !k.startsWith('$')) values[k] = v;
  return values;
}

export async function createProject(
  workspaceId: string,
  _prev: ProjectFormState,
  form: FormData,
): Promise<ProjectFormState> {
  const ws = z.uuid().safeParse(workspaceId);
  const parsed = parseProject(form);
  if (!ws.success) return { error: 'Unknown workspace' };
  if (!parsed.success) return { error: firstIssue(parsed.error), values: submitted(form) };

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from('projects')
    .insert({ ...parsed.data, workspace_id: ws.data })
    .select('id')
    .single();
  if (error) return { error: error.message, values: submitted(form) };
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
  if (!parsed.success) return { error: firstIssue(parsed.error), values: submitted(form) };

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

/** The worker writes to a run's rows while it scans, so deleting under it would fail that run noisily. */
async function hasActiveRun(supabase: Awaited<ReturnType<typeof requireUser>>['supabase'], projectIds: string[]) {
  if (projectIds.length === 0) return false;
  const { data } = await supabase
    .from('runs')
    .select('id')
    .in('project_id', projectIds)
    .in('status', ['queued', 'running'])
    .limit(1);
  return (data?.length ?? 0) > 0;
}

export async function deleteProject(workspaceId: string, projectId: string): Promise<{ error?: string }> {
  const ids = z.object({ ws: z.uuid(), p: z.uuid() }).safeParse({ ws: workspaceId, p: projectId });
  if (!ids.success) return { error: 'Unknown project' };

  const { supabase } = await requireUser();
  if (await hasActiveRun(supabase, [ids.data.p])) return { error: 'A scan is running. Delete the project after it finishes.' };
  // Runs and bugs go with it (on delete cascade); evidence files expire through housekeeping.
  const { data, error } = await supabase
    .from('projects')
    .delete()
    .eq('id', ids.data.p)
    .eq('workspace_id', ids.data.ws)
    .select('id');
  if (error) return { error: 'Could not delete the project' };
  if (data.length === 0) return { error: 'You do not have permission to delete this project' };

  revalidatePath(`/w/${ids.data.ws}`);
  redirect(`/w/${ids.data.ws}`);
}

export async function deleteWorkspace(workspaceId: string): Promise<{ error?: string }> {
  const ws = z.uuid().safeParse(workspaceId);
  if (!ws.success) return { error: 'Unknown workspace' };

  const { supabase } = await requireUser();
  const { data: projects } = await supabase.from('projects').select('id').eq('workspace_id', ws.data);
  if (await hasActiveRun(supabase, (projects ?? []).map((p) => p.id))) {
    return { error: 'A scan is running in this workspace. Delete it after the scan finishes.' };
  }
  // Owner-only by RLS; projects, runs, bugs, members and invites cascade.
  const { data, error } = await supabase.from('workspaces').delete().eq('id', ws.data).select('id');
  if (error) return { error: 'Could not delete the workspace' };
  if (data.length === 0) return { error: 'Only the workspace owner can delete it' };

  revalidatePath('/w');
  redirect('/w');
}

export type RenameState = { error?: string; ok?: boolean };

export async function renameWorkspace(workspaceId: string, _prev: RenameState, form: FormData): Promise<RenameState> {
  const parsed = WorkspaceInput.extend({ ws: z.uuid() }).safeParse({ ws: workspaceId, name: form.get('name') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid name' };

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from('workspaces')
    .update({ name: parsed.data.name })
    .eq('id', parsed.data.ws)
    .select('id');
  if (error) return { error: 'Could not rename the workspace' };
  if (data.length === 0) return { error: 'Only the workspace owner can rename it' };

  revalidatePath(`/w/${parsed.data.ws}`, 'layout');
  return { ok: true };
}

export async function rotateWebhookSecret(workspaceId: string, projectId: string): Promise<{ error?: string; secret?: string }> {
  const ids = z.object({ ws: z.uuid(), p: z.uuid() }).safeParse({ ws: workspaceId, p: projectId });
  if (!ids.success) return { error: 'Unknown project' };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc('rotate_project_webhook_secret', { p: ids.data.p });
  if (error) return { error: 'Could not rotate the secret' };
  if (!data) return { error: 'You do not have permission to change this project' };
  return { secret: data };
}
