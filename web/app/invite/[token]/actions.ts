'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/server/auth';

export async function acceptInvite(token: string): Promise<{ error?: string }> {
  const parsed = z.string().regex(/^[0-9a-f]{64}$/).safeParse(token);
  if (!parsed.success) return { error: 'This invite link is not valid' };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc('accept_workspace_invite', { token: parsed.data });
  if (error) return { error: error.message };
  redirect(`/w/${data}`);
}
