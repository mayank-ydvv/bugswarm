import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { KeyRoundIcon, UsersIcon } from 'lucide-react';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireUser } from '@/lib/server/auth';
import { uuidParam } from '@/lib/server/params';
import { GeminiKeyForm } from './gemini-key-form';

export const metadata: Metadata = { title: 'Workspace settings' };

export default async function WorkspaceSettingsPage({ params }: { params: Promise<{ ws: string }> }) {
  const ws = uuidParam((await params).ws);
  const { supabase, userId, email } = await requireUser();

  const [{ data: workspace }, { data: members, error }] = await Promise.all([
    supabase.from('workspaces').select('name, gemini_secret_id').eq('id', ws).maybeSingle(),
    supabase.from('workspace_members').select('user_id, role').eq('workspace_id', ws).order('role'),
  ]);
  if (error) throw new Error(error.message);
  if (!workspace) notFound();

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
          <CardDescription>Invites are coming in a later phase.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center justify-between gap-3 py-2">
                <span className="truncate">
                  {m.user_id === userId ? `${email ?? 'You'} (you)` : <span className="font-mono">{m.user_id.slice(0, 8)}…</span>}
                </span>
                <Badge variant="secondary" className="capitalize">
                  {m.role}
                </Badge>
              </li>
            ))}
          </ul>
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
            isOwner={members.some((m) => m.user_id === userId && m.role === 'owner')}
          />
        </CardContent>
      </Card>
    </div>
  );
}
