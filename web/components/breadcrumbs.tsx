import Link from 'next/link';
import { ChevronRightIcon } from 'lucide-react';

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
      {items.map((c, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1">
          {i > 0 && <ChevronRightIcon className="size-3.5 shrink-0" />}
          {c.href ? (
            <Link href={c.href} className="truncate hover:text-foreground">
              {c.label}
            </Link>
          ) : (
            <span className="truncate text-foreground">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
