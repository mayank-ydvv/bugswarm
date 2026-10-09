'use client';

import { useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { ClipboardListIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { combinePrompts, STATUS_LABEL, STATUSES } from '@/lib/bugs';
import { createClient } from '@/lib/supabase/client';
import { SEVERITIES } from '@/lib/types';
import { setBugsStatus } from './actions';

const RANK = new Map(SEVERITIES.map((s, i) => [s, i]));

export function BulkBar({ projectId, ids, onDone }: { projectId: string; ids: number[]; onDone: () => void }) {
  const path = usePathname();
  const [pending, start] = useTransition();
  const [copying, setCopying] = useState(false);

  const apply = (status: string) =>
    start(async () => {
      const res = await setBugsStatus({ projectId, ids, status, path });
      if (res.error) return void toast.error(res.error);
      toast.success(
        `${res.updated} ${res.updated === 1 ? 'bug' : 'bugs'} marked as ${STATUS_LABEL[status as keyof typeof STATUS_LABEL].toLowerCase()}`,
      );
      onDone();
    });

  async function copyCombined() {
    setCopying(true);
    try {
      // Prompts are not part of the list rows; fetch them for the selection only.
      const { data, error } = await createClient()
        .from('bugs')
        .select('id, severity, fix_prompt, technical, title')
        .in('id', ids);
      if (error) throw error;
      const ordered = [...data].sort((a, b) => (RANK.get(a.severity) ?? 9) - (RANK.get(b.severity) ?? 9) || b.id - a.id);
      const text = combinePrompts(ordered.map((b) => b.fix_prompt ?? b.technical ?? b.title));
      await navigator.clipboard.writeText(text);
      toast.success(`Combined prompt for ${ordered.length} bugs copied`);
    } catch {
      toast.error('Could not copy the combined prompt');
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-background/95 p-2 shadow-sm backdrop-blur">
      <span className="px-1 text-sm font-medium">{ids.length} selected</span>
      <Select onValueChange={apply} disabled={pending}>
        <SelectTrigger size="sm" className="w-40" aria-label="Change status of selected bugs">
          <SelectValue placeholder="Change status…" />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" onClick={copyCombined} disabled={copying}>
        <ClipboardListIcon className="size-4" />
        Copy combined prompt
      </Button>
      <Button size="sm" variant="ghost" onClick={onDone} aria-label="Clear selection" className="ml-auto">
        <XIcon className="size-4" />
      </Button>
    </div>
  );
}
