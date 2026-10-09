import { redirect } from 'next/navigation';
import { BotIcon, GitBranchIcon, ListChecksIcon, WandSparklesIcon } from 'lucide-react';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { missingPublicEnv } from '@/lib/env';
import { safeNextPath } from '@/lib/schemas';
import { createClient } from '@/lib/supabase/server';
import { SignInForm } from './sign-in-form';

const AUTH_ERRORS: Record<string, string> = {
  missing_code: 'Sign-in was interrupted. Please try again.',
  auth_failed: 'Could not complete sign-in. Please try again.',
  oauth_denied: 'GitHub sign-in was cancelled.',
};

const FEATURES = [
  { icon: GitBranchIcon, title: 'Connect a repo or URL', body: 'Runs on every push, hourly, or nightly.' },
  { icon: BotIcon, title: 'A swarm of testers', body: 'Linters, type checks, security scanners and a browser crawler run in parallel.' },
  { icon: ListChecksIcon, title: 'Bugs in plain English', body: 'Deduplicated, ranked by severity, auto-closed when fixed.' },
  { icon: WandSparklesIcon, title: 'Ready-to-paste fix prompts', body: 'Every bug comes with a Claude Code prompt to fix it.' },
];

export default async function Landing({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const missing = missingPublicEnv();

  if (missing.length === 0) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (data?.claims) redirect(safeNextPath(next));
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 sm:px-6">
      <header className="flex h-14 items-center justify-between">
        <Logo />
        <ThemeToggle />
      </header>
      <main className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.2fr_1fr]">
        <section className="flex flex-col gap-6">
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Your app, tested around the clock. Bugs explained in plain English.
          </h1>
          <p className="max-w-prose text-muted-foreground">
            Add a GitHub repo or a live URL. BugSwarm keeps testing it and lists every bug it finds, each with a
            ready-to-paste fix prompt.
          </p>
          <ul className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3">
                <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{title}</p>
                  <p className="text-sm text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
        <Card className="w-full max-w-md justify-self-center">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Use GitHub or your email.</CardDescription>
          </CardHeader>
          <CardContent>
            {missing.length > 0 ? (
              <p className="text-sm text-destructive">
                Supabase is not configured. Set {missing.join(', ')} in <code>.env</code> (see README).
              </p>
            ) : (
              <SignInForm next={safeNextPath(next)} oauthError={error ? AUTH_ERRORS[error] : undefined} />
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
