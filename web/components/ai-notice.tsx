import { InfoIcon } from 'lucide-react';

export function AiNotice() {
  return (
    <p className="flex items-start gap-2 text-xs text-muted-foreground">
      <InfoIcon className="mt-px size-3.5 shrink-0" />
      AI analysis uses free-tier models; use only on code you&apos;re allowed to share.
    </p>
  );
}
