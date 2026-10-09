'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { STATUSES } from '@/lib/bugs';
import { requireUser } from '@/lib/server/auth';

const Input = z.object({
  bugId: z.coerce.number().int().positive(),
  status: z.enum(STATUSES as [string, ...string[]]),
  path: z.string().startsWith('/w/'),
});

/** Users may only change `status` (column grant); RLS limits it to owners/members. */
export async function setBugStatus(input: { bugId: number; status: string; path: string }) {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { error: 'Invalid request' };
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from('bugs')
    .update({ status: parsed.data.status as never })
    .eq('id', parsed.data.bugId)
    .select('id');
  if (error) return { error: error.message };
  if (data.length === 0) return { error: 'You do not have permission to change this bug' };
  revalidatePath(parsed.data.path);
  return { ok: true };
}
