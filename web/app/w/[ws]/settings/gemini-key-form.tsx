'use client';

import { useActionState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { removeGeminiKey, saveGeminiKey, type KeyFormState } from './actions';

export function GeminiKeyForm({ workspaceId, hasKey, isOwner }: { workspaceId: string; hasKey: boolean; isOwner: boolean }) {
  const [state, action, pending] = useActionState<KeyFormState, FormData>(
    async (prev, form) => {
      const res = await saveGeminiKey(workspaceId, prev, form);
      if (res.ok) toast.success(res.ok);
      return res;
    },
    {},
  );
  const [removing, startRemove] = useTransition();

  if (!isOwner) {
    return (
      <p className="text-sm text-muted-foreground">
        {hasKey ? 'This workspace uses its own Gemini key.' : 'This workspace uses the server key.'} Only the owner can change it.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm">
        Status:{' '}
        <span className="font-medium">{hasKey ? 'Using this workspace’s own key (stored encrypted)' : 'Using the server key'}</span>
      </p>
      <form action={action} className="grid gap-2">
        <Label htmlFor="gemini-key">{hasKey ? 'Replace key' : 'Gemini API key'}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="gemini-key"
            name="key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="AIza…"
            required
            className="font-mono"
          />
          <Button type="submit" disabled={pending}>
            Save key
          </Button>
        </div>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <p className="text-xs text-muted-foreground">
          The key is encrypted with Supabase Vault and only the worker can read it. It is never shown again.
        </p>
      </form>
      {hasKey && (
        <div>
          <Button
            variant="outline"
            size="sm"
            disabled={removing}
            onClick={() =>
              startRemove(async () => {
                const res = await removeGeminiKey(workspaceId);
                if (res.error) toast.error(res.error);
                else toast.success(res.ok);
              })
            }
          >
            Remove key
          </Button>
        </div>
      )}
    </div>
  );
}
