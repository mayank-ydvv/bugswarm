import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/** Signed-in user + user-scoped client, or a redirect to the landing page. */
export async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect('/login');
  return { supabase, userId: claims.sub, email: typeof claims.email === 'string' ? claims.email : null };
}
