'use client';

import { useActionState, useState } from 'react';
import { GithubIcon } from 'lucide-react';
import { emailAuth, type AuthState } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { createClient } from '@/lib/supabase/client';

export function SignInForm({ next, oauthError }: { next: string; oauthError?: string }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [state, action, pending] = useActionState<AuthState, FormData>(emailAuth, {});
  const [githubPending, setGithubPending] = useState(false);

  async function signInWithGitHub() {
    setGithubPending(true);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await createClient().auth.signInWithOAuth({ provider: 'github', options: { redirectTo } });
    if (error) setGithubPending(false);
  }

  const error = state.error ?? oauthError;

  return (
    <div className="flex flex-col gap-4">
      <Button variant="outline" onClick={signInWithGitHub} disabled={githubPending}>
        <GithubIcon className="size-4" />
        Continue with GitHub
      </Button>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <Separator className="flex-1" />
        or with email
        <Separator className="flex-1" />
      </div>

      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="mode" value={mode} />
        <input type="hidden" name="next" value={next} />
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            minLength={8}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {mode === 'signin' ? 'Sign in' : 'Create account'}
        </Button>
      </form>

      <button
        type="button"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
      >
        {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Sign in'}
      </button>
    </div>
  );
}
