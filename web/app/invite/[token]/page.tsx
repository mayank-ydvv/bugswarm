import type { Metadata } from 'next';
import Link from 'next/link';
import { MailIcon } from 'lucide-react';
import { AppHeader } from '@/components/app-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireUser } from '@/lib/server/auth';
import { AcceptButton } from './accept-button';

export const metadata: Metadata = { title: 'Workspace invite' };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { supabase, email } = await requireUser();
  const valid = /^[0-9a-f]{64}$/.test(token);
  const { data } = valid ? await supabase.rpc('peek_workspace_invite', { token }) : { data: null };
  const invite = data?.[0];

  let body: React.ReactNode;
  if (!invite || invite.accepted || invite.expired) {
    body = (
      <>
        <CardDescription>
          {!invite
            ? 'This invite link is not valid.'
            : invite.accepted
              ? 'This invite has already been used.'
              : 'This invite has expired.'}{' '}
          Ask the workspace owner for a new one.
        </CardDescription>
        <Button asChild variant="outline" className="w-fit">
          <Link href="/w">Go to your workspaces</Link>
        </Button>
      </>
    );
  } else if (!invite.email_matches) {
    body = (
      <>
        <CardDescription>
          This invite to <span className="font-medium text-foreground">{invite.workspace_name}</span> was sent to a
          different email address than the one you are signed in with ({email ?? 'unknown'}). Sign out and sign in
          with the invited address.
        </CardDescription>
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      </>
    );
  } else {
    body = (
      <>
        <CardDescription>
          You&apos;ve been invited to <span className="font-medium text-foreground">{invite.workspace_name}</span> as a{' '}
          <span className="font-medium text-foreground">{invite.role}</span>
          {invite.role === 'viewer' ? ' (read-only)' : ' (can run scans and update bugs)'}.
        </CardDescription>
        <AcceptButton token={token} />
      </>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader email={email} />
      <main className="mx-auto flex w-full max-w-md flex-1 items-start px-4 py-12">
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MailIcon className="size-5" /> Workspace invite
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">{body}</CardContent>
        </Card>
      </main>
    </div>
  );
}
