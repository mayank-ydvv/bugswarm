import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

export type WorkspaceRole = 'owner' | 'member' | 'viewer';

/** The signed-in user's role in a workspace (RLS lets members read memberships), or null. */
export async function myRole(supabase: SupabaseClient<Database>, ws: string, userId: string): Promise<WorkspaceRole | null> {
  const { data } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', ws)
    .eq('user_id', userId)
    .maybeSingle();
  return (data?.role as WorkspaceRole | undefined) ?? null;
}

/** Owners and members can change things; viewers are read-only (RLS enforces it, the UI hides it). */
export const canWrite = (role: WorkspaceRole | null) => role === 'owner' || role === 'member';
