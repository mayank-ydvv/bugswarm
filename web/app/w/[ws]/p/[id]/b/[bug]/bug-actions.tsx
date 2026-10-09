'use client';

import { useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { CheckIcon, CircleDotIcon, EyeOffIcon, LoaderIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { STATUS_LABEL, STATUSES } from '@/lib/bugs';
import type { BugStatus } from '@/lib/types';
import { setBugStatus } from './actions';

function useStatus(bugId: number) {
  const path = usePathname();
  const [pending, start] = useTransition();
  const set = (status: BugStatus) =>
    start(async () => {
      const res = await setBugStatus({ bugId, status, path });
      if (res.error) toast.error(res.error);
      else toast.success(`Marked ${STATUS_LABEL[status].toLowerCase()}`);
    });
  return { pending, set };
}

export function StatusSelect({ bugId, status }: { bugId: number; status: BugStatus }) {
  const { pending, set } = useStatus(bugId);
  return (
    <Select value={status} onValueChange={(v) => set(v as BugStatus)} disabled={pending}>
      <SelectTrigger className="w-36" aria-label="Status">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {STATUS_LABEL[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function StatusButtons({ bugId, status }: { bugId: number; status: BugStatus }) {
  const { pending, set } = useStatus(bugId);
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" disabled={pending || status === 'in_progress'} onClick={() => set('in_progress')}>
        {pending ? <LoaderIcon className="size-4 animate-spin" /> : <CircleDotIcon className="size-4" />}
        Mark in progress
      </Button>
      <Button variant="outline" size="sm" disabled={pending || status === 'fixed'} onClick={() => set('fixed')}>
        <CheckIcon className="size-4" />
        Mark fixed
      </Button>
      <Button variant="ghost" size="sm" disabled={pending || status === 'ignored'} onClick={() => set('ignored')}>
        <EyeOffIcon className="size-4" />
        Not a bug
      </Button>
    </div>
  );
}
