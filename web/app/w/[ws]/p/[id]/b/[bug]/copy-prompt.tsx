'use client';

import { useEffect, useState } from 'react';
import { CheckIcon, ClipboardIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { markOpened } from '@/lib/opened';

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers that block the async clipboard API.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function CopyPromptButton({ prompt, className }: { prompt: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      className={className}
      onClick={async () => {
        if (await copy(prompt)) {
          setCopied(true);
          toast.success('Fix prompt copied. Paste it into Claude Code.');
          setTimeout(() => setCopied(false), 2000);
        } else {
          toast.error('Could not copy. Select the prompt text and copy it manually.');
        }
      }}
    >
      {copied ? <CheckIcon className="size-4" /> : <ClipboardIcon className="size-4" />}
      Copy prompt
    </Button>
  );
}

/** Clears the "NEW" badge for this bug in the list (per browser). */
export function MarkOpened({ projectId, bugId }: { projectId: string; bugId: number }) {
  useEffect(() => markOpened(projectId, bugId), [projectId, bugId]);
  return null;
}
