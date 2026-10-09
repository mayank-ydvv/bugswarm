import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { KeyRoundIcon, UsersIcon } from 'lucide-react';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireUser } from '@/lib/server/auth';
import { uuidParam } from '@/lib/server/params';
import { GeminiKeyForm } from './gemini-key-form';
import { MembersCard } from './members-card';

export const metadata: Metadata = { title: 'Workspace settings' };

export default async function WorkspaceSettingsPage({ params }: { params: Promise<{ ws: string }> }) {
  const ws = uuidParam((await params).ws);
  const { supabase, userId } = await requireUser();

  const [{ data: workspace }, { data: members, error }, { data: invites }] = await Promise.all([
    supabase.from('workspaces').select('name, gemini_secret_id').eq('id', ws).maybeSingle(),
    supabase.rpc('list_workspace_members', { ws }),
    // RLS returns rows only to the owner; everyone else gets an empty list.
    supabase
      .from('workspace_invites')
      .select('id, email, role, expires_at')
      .eq('workspace_id', ws)
      .is('accepted_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false }),
  ]);
  if (error) throw new Error(error.message);
  if (!workspace) notFound();
  const isOwner = members.some((m) => m.user_id === userId && m.role === 'owner');

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Breadcrumbs
          items={[
            { label: 'Workspaces', href: '/w' },
            { label: workspace.name, href: `/w/${ws}` },
            { label: 'Settings' },
          ]}
        />
        <h1 className="text-xl font-semibold">Workspace settings</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UsersIcon className="size-4" /> Members
          </CardTitle>
          <CardDescription>Owners invite people as members (can run scans) or viewers (read-only).</CardDescription>
        </CardHeader>
        <CardContent>
          <MembersCard workspaceId={ws} members={members} invites={invites ?? []} myUserId={userId} isOwner={isOwner} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRoundIcon className="size-4" /> Your Gemini API key
          </CardTitle>
          <CardDescription>
            Use your own free Gemini key for this workspace&apos;s AI calls instead of the server&apos;s.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GeminiKeyForm
            workspaceId={ws}
            hasKey={workspace.gemini_secret_id !== null}
            isOwner={isOwner}
          />
        </CardContent>
      </Card>
    </div>
  );
}
