'use client';

import { useActionState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { renameWorkspace, type RenameState } from '../actions';

export function RenameWorkspaceForm({ workspaceId, name }: { workspaceId: string; name: string }) {
  const [state, action, pending] = useActionState(async (prev: RenameState, form: FormData) => {
    const result = await renameWorkspace(workspaceId, prev, form);
    if (result.ok) toast.success('Workspace renamed');
    return result;
  }, {});

  return (
    <form action={action} className="grid gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input name="name" defaultValue={name} maxLength={80} required aria-label="Workspace name" className="flex-1" />
        <Button type="submit" variant="outline" disabled={pending}>
          Rename
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      )}
    </form>
  );
}
