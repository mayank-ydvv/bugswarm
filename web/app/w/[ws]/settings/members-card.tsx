'use client';

import { useActionState, useState, useTransition } from 'react';
import { CheckIcon, CopyIcon, LogOutIcon, MailPlusIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { relativeTime } from '@/lib/format';
import { createInvite, removeMember, revokeInvite, setMemberRole, type InviteState } from './member-actions';

export interface MemberRow {
  user_id: string;
  email: string | null;
  role: string;
}

export interface InviteRow {
  id: string;
  email: string;
  role: string;
  expires_at: string;
}

const ROLE_HELP: Record<string, string> = {
  member: 'Can run scans and change bug status',
  viewer: 'Read-only',
};

export function MembersCard({
  workspaceId,
  members,
  invites,
  myUserId,
  isOwner,
}: {
  workspaceId: string;
  members: MemberRow[];
  invites: InviteRow[];
  myUserId: string;
  isOwner: boolean;
}) {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string; ok?: boolean }>, success: string) =>
    start(async () => {
      const res = await fn();
      if (res?.error) toast.error(res.error);
      else toast.success(success);
    });
  const me = members.find((m) => m.user_id === myUserId);

  return (
    <div className="grid gap-5">
      <ul className="divide-y text-sm">
        {members.map((m) => {
          const self = m.user_id === myUserId;
          const editable = isOwner && m.role !== 'owner';
          return (
            <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0 truncate">
                {m.email ?? 'unknown'}
                {self && <span className="text-muted-foreground"> (you)</span>}
              </span>
              <span className="flex items-center gap-2">
                {editable ? (
                  <>
                    <Select
                      value={m.role}
                      disabled={pending}
                      onValueChange={(role) => run(() => setMemberRole(workspaceId, m.user_id, role), 'Role updated')}
                    >
                      <SelectTrigger size="sm" className="w-28" aria-label={`Role of ${m.email}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${m.email}`}
                      disabled={pending}
                      onClick={() => run(() => removeMember(workspaceId, m.user_id), 'Member removed')}
                    >
                      <XIcon className="size-4" />
                    </Button>
                  </>
                ) : (
                  <Badge variant="secondary" className="capitalize">
                    {m.role}
                  </Badge>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {isOwner ? (
        <InviteForm workspaceId={workspaceId} invites={invites} onRevoke={(id) => run(() => revokeInvite(workspaceId, id), 'Invite revoked')} pending={pending} />
      ) : (
        me &&
        me.role !== 'owner' && (
          <div>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                if (confirm('Leave this workspace? You will lose access until someone invites you again.')) {
                  run(() => removeMember(workspaceId, myUserId), 'You left the workspace');
                }
              }}
            >
              <LogOutIcon className="size-4" />
              Leave workspace
            </Button>
          </div>
        )
      )}
    </div>
  );
}

function InviteForm({
  workspaceId,
  invites,
  onRevoke,
  pending,
}: {
  workspaceId: string;
  invites: InviteRow[];
  onRevoke: (id: string) => void;
  pending: boolean;
}) {
  const [state, action, creating] = useActionState<InviteState, FormData>(createInvite.bind(null, workspaceId), {});
  const [role, setRole] = useState('member');
  const [copied, setCopied] = useState(false);
  // Hide the one-time link once its invite is revoked (it drops out of the pending list), so a dead
  // link isn't left on screen to copy.
  const stillPending = invites.some((i) => i.email.toLowerCase() === state.email?.toLowerCase());
  const link =
    state.token && stillPending ? `${typeof window === 'undefined' ? '' : window.location.origin}/invite/${state.token}` : null;

  return (
    <div className="grid gap-3 border-t pt-4">
      <form action={action} className="grid gap-2">
        <Label htmlFor="invite-email">Invite someone</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input id="invite-email" name="email" type="email" required placeholder="teammate@example.com" className="flex-1" />
          <input type="hidden" name="role" value={role} />
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="w-full sm:w-32" aria-label="Role for the invite">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="viewer">Viewer</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" disabled={creating}>
            <MailPlusIcon className="size-4" />
            Create invite
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{ROLE_HELP[role]}. Links expire after 7 days.</p>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      </form>

      {link && (
        <div className="grid gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
          <p>
            Send this link to <span className="font-medium">{state.email}</span>. They must sign in with that email.
            It is shown only once.
          </p>
          <div className="flex gap-2">
            <Input readOnly value={link} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="Invite link" />
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                setCopied(true);
                toast.success('Invite link copied');
              }}
            >
              {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
              Copy
            </Button>
          </div>
        </div>
      )}

      {invites.length > 0 && (
        <div className="grid gap-1">
          <p className="text-xs font-medium text-muted-foreground">Pending invites</p>
          <ul className="divide-y text-sm">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 truncate">
                  {i.email} <span className="text-muted-foreground">· {i.role} · expires {relativeTime(i.expires_at)}</span>
                </span>
                <Button variant="ghost" size="sm" disabled={pending} onClick={() => onRevoke(i.id)}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
