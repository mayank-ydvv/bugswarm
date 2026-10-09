'use server';

import { redirect } from 'next/navigation';
import { EmailAuthInput, safeNextPath } from '@/lib/schemas';
import { createClient } from '@/lib/supabase/server';

export type AuthState = { error?: string };

export async function emailAuth(_prev: AuthState, form: FormData): Promise<AuthState> {
  const parsed = EmailAuthInput.safeParse({
    email: form.get('email'),
    password: form.get('password'),
    mode: form.get('mode'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const { email, password, mode } = parsed.data;
  const supabase = await createClient();
  const { data, error } =
    mode === 'signup'
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: error.message };
  // Sign-up with email confirmation enabled returns a user but no session.
  if (!data.session) return { error: 'Check your inbox to confirm your email, then sign in.' };
  redirect(safeNextPath(form.get('next') as string | null));
}
