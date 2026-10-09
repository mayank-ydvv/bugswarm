'use server';

import { redirect } from 'next/navigation';
import { WorkspaceInput } from '@/lib/schemas';
import { requireUser } from '@/lib/server/auth';

export type FormState = { error?: string };

export async function createWorkspace(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = WorkspaceInput.safeParse({ name: form.get('name') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase
    .from('workspaces')
    .insert({ name: parsed.data.name, owner_id: userId })
    .select('id')
    .single();
  if (error) return { error: error.message };
  redirect(`/w/${data.id}`);
}
