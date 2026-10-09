'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { STATUSES } from '@/lib/bugs';
import { requireUser } from '@/lib/server/auth';

const BulkInput = z.object({
  projectId: z.uuid(),
  ids: z.array(z.number().int().positive()).min(1).max(500),
  status: z.enum(STATUSES as [string, ...string[]]),
  path: z.string().startsWith('/w/'),
});

/** One UPDATE for the whole selection; RLS and the status-only column grant still apply. */
export async function setBugsStatus(input: z.input<typeof BulkInput>) {
  const parsed = BulkInput.safeParse(input);
  if (!parsed.success) return { error: 'Invalid request' };
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from('bugs')
    .update({ status: parsed.data.status as never })
    .eq('project_id', parsed.data.projectId)
    .in('id', parsed.data.ids)
    .select('id');
  if (error) return { error: error.message };
  revalidatePath(parsed.data.path);
  return { updated: data.length };
}
