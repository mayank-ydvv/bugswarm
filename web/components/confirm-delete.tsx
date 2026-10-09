'use client';

import { useState, useTransition } from 'react';
import { Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * A destructive action behind a dialog that asks for the item's name, so a stray click can't delete
 * a project or workspace. `action` redirects on success; it only returns when something went wrong.
 */
export function ConfirmDelete({
  label,
  name,
  description,
  action,
}: {
  label: string;
  name: string;
  description: string;
  action: () => Promise<{ error?: string } | void>;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setTyped('');
        setError(undefined);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="destructive">
          <Trash2Icon className="size-4" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}?</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const result = await action();
              if (result?.error) setError(result.error);
            });
          }}
        >
          <Label htmlFor="confirm-name">
            Type <span className="font-mono font-semibold">{name}</span> to confirm
          </Label>
          <Input id="confirm-name" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter className="mt-2">
            <Button type="submit" variant="destructive" disabled={pending || typed.trim() !== name}>
              {pending ? 'Deleting…' : label}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
