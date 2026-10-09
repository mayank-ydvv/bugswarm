'use client';

import { useState, useSyncExternalStore, useTransition } from 'react';
import { CheckIcon, CopyIcon, ExternalLinkIcon, EyeIcon, EyeOffIcon, RefreshCwIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { rotateWebhookSecret } from '../../../actions';

const subscribe = () => () => {};

/** GitHub's "Add webhook" page for a github.com repo URL, or null for other hosts. */
function newHookUrl(repoUrl: string): string | null {
  const m = /^https:\/\/(www\.)?github\.com\/([^/]+)\/([^/]+?)(\.git)?\/?$/.exec(repoUrl);
  return m ? `https://github.com/${m[2]}/${m[3]}/settings/hooks/new` : null;
}

export function WebhookCard({
  workspaceId,
  projectId,
  repoUrl,
  branch,
  secret: initialSecret,
}: {
  workspaceId: string;
  projectId: string;
  repoUrl: string;
  branch: string;
  secret: string;
}) {
  const origin = useSyncExternalStore(subscribe, () => window.location.origin, () => '');
  const payloadUrl = `${origin}/api/github/webhook`;
  const [secret, setSecret] = useState(initialSecret);
  const [shown, setShown] = useState(false);
  const [pending, startTransition] = useTransition();
  const hookUrl = newHookUrl(repoUrl);

  return (
    <div className="grid gap-4 text-sm">
      <ol className="grid list-decimal gap-1 pl-5 text-muted-foreground">
        <li>
          Open your repo&apos;s webhook settings
          {hookUrl ? ' (button below)' : ' (Settings → Webhooks → Add webhook)'}.
        </li>
        <li>Paste the payload URL and the secret. Set the content type to application/json.</li>
        <li>Choose &ldquo;Just the push event&rdquo; and save.</li>
      </ol>

      <CopyField id="payload-url" label="Payload URL" value={payloadUrl} />
      <Field label="Content type" value="application/json" />
      <CopyField
        id="webhook-secret"
        label="Secret"
        value={secret}
        masked={!shown}
        extra={
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={shown ? 'Hide secret' : 'Show secret'}
            onClick={() => setShown((s) => !s)}
          >
            {shown ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
          </Button>
        }
      />

      <p className="text-muted-foreground">
        Every push to <span className="font-mono text-foreground">{branch}</span> then starts a scan of the changed files.
      </p>

      <div className="flex flex-wrap gap-2">
        {hookUrl && (
          <Button asChild>
            <a href={hookUrl} target="_blank" rel="noreferrer">
              <ExternalLinkIcon className="size-4" />
              Add webhook on GitHub
            </a>
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (!window.confirm('Rotate the secret? The current GitHub webhook stops working until you paste the new one.')) return;
            startTransition(async () => {
              const res = await rotateWebhookSecret(workspaceId, projectId);
              if (res.error || !res.secret) {
                toast.error(res.error ?? 'Could not rotate the secret');
                return;
              }
              setSecret(res.secret);
              setShown(true);
              toast.success('New secret created. Update it in your GitHub webhook.');
            });
          }}
        >
          <RefreshCwIcon className="size-4" />
          Rotate secret
        </Button>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <p className="font-mono">{value}</p>
    </div>
  );
}

function CopyField({
  id,
  label,
  value,
  masked = false,
  extra,
}: {
  id: string;
  label: string;
  value: string;
  masked?: boolean;
  extra?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          readOnly
          value={masked ? '•'.repeat(32) : value}
          className="font-mono text-xs"
          onFocus={(e) => !masked && e.currentTarget.select()}
        />
        {extra}
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              toast.error('Could not copy. Select the text and copy it instead.');
            }
          }}
        >
          {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
        </Button>
      </div>
    </div>
  );
}
