import { cn } from '@/lib/utils';
import type { Severity } from '@/lib/types';

export const SEVERITY_DOT: Record<Severity, string> = {
  critical: 'bg-red-600',
  high: 'bg-orange-500',
  medium: 'bg-amber-400',
  low: 'bg-slate-400',
};

export function SeverityDot({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <span
      role="img"
      aria-label={severity}
      className={cn('inline-block size-2.5 shrink-0 rounded-full', SEVERITY_DOT[severity], className)}
    />
  );
}
