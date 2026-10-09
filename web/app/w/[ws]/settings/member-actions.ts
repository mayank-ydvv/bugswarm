'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/server/auth';

export type InviteState = { error?: string; token?: string; email?: string };

const InviteInput = z.object({
  ws: z.uuid(),
  email: z.email('Enter a valid email address').transform((e) => e.trim().toLowerCase()),
  role: z.enum(['member', 'viewer']),
});

const ERRORS: Record<string, string> = {
  '42501': 'Only the workspace owner can do that',
  '23505': 'That person is already a member',
};

/** Returns the one-time invite token; only its hash is stored, so it cannot be shown again. */
export async function createInvite(ws: string, _prev: InviteState, form: FormData): Promise<InviteState> {
  const parsed = InviteInput.safeParse({ ws, email: form.get('email'), role: form.get('role') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc('create_workspace_invite', {
    ws: parsed.data.ws,
    invite_email: parsed.data.email,
    invite_role: parsed.data.role,
  });
  if (error) return { error: ERRORS[error.code ?? ''] ?? 'Could not create the invite' };
  revalidatePath(`/w/${parsed.data.ws}/settings`);
  return { token: data, email: parsed.data.email };
}

const Ids = z.object({ ws: z.uuid(), id: z.uuid() });

export async function revokeInvite(ws: string, inviteId: string) {
  const ids = Ids.safeParse({ ws, id: inviteId });
  if (!ids.success) return { error: 'Invalid request' };
  const { supabase } = await requireUser();
  const { error } = await supabase.from('workspace_invites').delete().eq('id', ids.data.id).eq('workspace_id', ids.data.ws);
  if (error) return { error: 'Could not revoke the invite' };
  revalidatePath(`/w/${ids.data.ws}/settings`);
  return { ok: true };
}

export async function setMemberRole(ws: string, userId: string, role: string) {
  const input = z.object({ ws: z.uuid(), user: z.uuid(), role: z.enum(['member', 'viewer']) }).safeParse({ ws, user: userId, role });
  if (!input.success) return { error: 'Invalid request' };
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from('workspace_members')
    .update({ role: input.data.role })
    .eq('workspace_id', input.data.ws)
    .eq('user_id', input.data.user)
    .select('user_id');
  if (error || data.length === 0) return { error: 'Only the workspace owner can change roles' };
  revalidatePath(`/w/${input.data.ws}/settings`);
  return { ok: true };
}

export async function removeMember(ws: string, userId: string) {
  const input = z.object({ ws: z.uuid(), user: z.uuid() }).safeParse({ ws, user: userId });
  if (!input.success) return { error: 'Invalid request' };
  const { supabase, userId: me } = await requireUser();
  const { data, error } = await supabase
    .from('workspace_members')
    .delete()
    .eq('workspace_id', input.data.ws)
    .eq('user_id', input.data.user)
    .select('user_id');
  if (error || data.length === 0) return { error: 'You cannot remove this member' };
  // Leaving a workspace: there is nothing left to show here.
  if (input.data.user === me) redirect('/w');
  revalidatePath(`/w/${input.data.ws}/settings`);
  return { ok: true };
}
