import { Badge } from '@/components/ui/badge';
import { TRIGGER_LABEL } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Database } from '@/lib/database.types';

type RunStatus = Database['public']['Enums']['run_status'];
type RunTrigger = Database['public']['Enums']['run_trigger'];

const STATUS_STYLE: Record<RunStatus, string> = {
  queued: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  running: 'bg-sky-500/15 text-sky-700 dark:text-sky-400',
  done: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  failed: 'bg-red-500/15 text-red-700 dark:text-red-400',
};

export function RunStatusBadge({ status }: { status: RunStatus }) {
  return (
    <Badge variant="secondary" className={cn('capitalize', STATUS_STYLE[status])}>
      {status}
    </Badge>
  );
}

export function TriggerBadge({ trigger }: { trigger: RunTrigger }) {
  return <Badge variant="outline">{TRIGGER_LABEL[trigger]}</Badge>;
}

export function ScanBadge({ full }: { full: boolean }) {
  return <Badge variant="outline">{full ? 'Full scan' : 'Incremental'}</Badge>;
}
