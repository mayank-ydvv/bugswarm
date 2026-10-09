import Link from 'next/link';
import { BugIcon } from 'lucide-react';

export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
        <BugIcon className="size-4" />
      </span>
      BugSwarm
    </Link>
  );
}
