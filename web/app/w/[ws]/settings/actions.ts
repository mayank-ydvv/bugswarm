'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/server/auth';

export type KeyFormState = { error?: string; ok?: string };

const KeyInput = z.object({
  ws: z.uuid(),
  key: z
    .string()
    .trim()
    .min(20, 'That does not look like a Gemini API key')
    .max(200)
    .regex(/^\S+$/, 'Keys contain no spaces'),
});

/** Stored with Supabase Vault by an owner-only database function; never echoed back. */
export async function saveGeminiKey(ws: string, _prev: KeyFormState, form: FormData): Promise<KeyFormState> {
  const parsed = KeyInput.safeParse({ ws, key: form.get('key') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid key' };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc('set_workspace_gemini_key', { ws: parsed.data.ws, api_key: parsed.data.key });
  if (error) return { error: error.code === '42501' ? 'Only the workspace owner can change the key' : 'Could not save the key' };
  revalidatePath(`/w/${parsed.data.ws}/settings`);
  return { ok: 'Key saved. AI calls for this workspace now use it.' };
}

export async function removeGeminiKey(ws: string): Promise<KeyFormState> {
  const id = z.uuid().safeParse(ws);
  if (!id.success) return { error: 'Unknown workspace' };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc('clear_workspace_gemini_key', { ws: id.data });
  if (error) return { error: error.code === '42501' ? 'Only the workspace owner can change the key' : 'Could not remove the key' };
  revalidatePath(`/w/${id.data}/settings`);
  return { ok: 'Key removed. AI calls use the server key again.' };
}
