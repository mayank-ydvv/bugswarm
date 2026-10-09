'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BugIcon, Loader2Icon, SearchIcon, XIcon } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { SeverityDot } from '@/components/severity';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useDebounced } from '@/hooks/use-debounced';
import {
  bugLocation,
  bugPageQuery,
  CATEGORIES,
  compareBugs,
  DEFAULT_FILTERS,
  matchesFilters,
  PAGE_SIZE,
  STATUS_LABEL,
  STATUSES,
  statusText,
  TESTERS,
  type BugFilters,
  type BugListRow,
  type Cursor,
} from '@/lib/bugs';
import { relativeTime } from '@/lib/format';
import { readOpened } from '@/lib/opened';
import { createClient, subscribeAsUser } from '@/lib/supabase/client';
import { SEVERITIES } from '@/lib/types';
import { cn } from '@/lib/utils';
import { BulkBar } from './bulk-bar';

type ArrayKey = 'status' | 'severity' | 'category' | 'tester';

const capitalize = (v: string) => (v === 'ui' ? 'UI' : v.charAt(0).toUpperCase() + v.slice(1));

const GROUPS: { key: ArrayKey; label: string; options: readonly string[]; format: (v: string) => string }[] = [
  { key: 'status', label: 'Status', options: STATUSES, format: (v) => STATUS_LABEL[v as keyof typeof STATUS_LABEL] },
  { key: 'severity', label: 'Severity', options: SEVERITIES, format: capitalize },
  { key: 'category', label: 'Category', options: CATEGORIES, format: capitalize },
  { key: 'tester', label: 'Tester', options: TESTERS, format: (v) => v },
];

function cursorOf(rows: BugListRow[]): Cursor | null {
  const last = rows[rows.length - 1];
  return rows.length === PAGE_SIZE && last ? { severity: last.severity, id: last.id } : null;
}

export function BugList({
  projectId,
  workspaceId,
  initial,
  canWrite,
}: {
  projectId: string;
  workspaceId: string;
  initial: BugListRow[];
  canWrite: boolean;
}) {
  const [filters, setFilters] = useState<BugFilters>(DEFAULT_FILTERS);
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 250);
  const effective = useMemo(() => ({ ...filters, q }), [filters, q]);

  // Map keyed by id: Realtime events and appended pages are O(1) each; sorting happens in useMemo.
  const [bugs, setBugs] = useState(() => new Map(initial.map((b) => [b.id, b])));
  const [cursor, setCursor] = useState<Cursor | null>(() => cursorOf(initial));
  const [loading, setLoading] = useState(false);
  const [opened, setOpened] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const toggleSelected = (id: number, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const filtersRef = useRef(effective);
  filtersRef.current = effective;
  const firstRender = useRef(true);
  const requestId = useRef(0);

  useEffect(() => setOpened(readOpened(projectId)), [projectId]);

  const load = useCallback(
    async (f: BugFilters, after: Cursor | null) => {
      const id = ++requestId.current;
      setLoading(true);
      const { data, error } = await bugPageQuery(createClient(), projectId, f, after);
      if (id !== requestId.current) return; // a newer filter change won
      setLoading(false);
      if (error) return;
      setBugs((prev) => {
        const next = after ? new Map(prev) : new Map<number, BugListRow>();
        for (const b of data) next.set(b.id, b);
        return next;
      });
      setCursor(cursorOf(data));
    },
    [projectId],
  );

  // Refetch page 1 when filters or the debounced search change (the server already sent the default view).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    void load(effective, null);
  }, [effective, load]);

  useEffect(
    () =>
      subscribeAsUser(`bugs:${projectId}`, (ch) =>
        ch.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bugs', filter: `project_id=eq.${projectId}` },
          (payload) => {
            setBugs((prev) => {
              const next = new Map(prev);
              if (payload.eventType === 'DELETE') {
                next.delete((payload.old as BugListRow).id);
              } else {
                const bug = payload.new as BugListRow;
                if (matchesFilters(bug, filtersRef.current)) next.set(bug.id, bug);
                else next.delete(bug.id);
              }
              return next;
            });
          },
        ),
      ),
    [projectId],
  );

  const sorted = useMemo(() => [...bugs.values()].sort(compareBugs), [bugs]);
  const allSelected = sorted.length > 0 && sorted.every((b) => selected.has(b.id));

  const toggle = (key: ArrayKey, value: string) =>
    setFilters((f) => {
      const list = f[key] as string[];
      return { ...f, [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
    });
  const isDefault =
    JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS) && search.trim() === '';

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search titles and files"
          className="pl-8"
          aria-label="Search bugs"
        />
        {loading && (
          <Loader2Icon className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        {GROUPS.map((g) => (
          <div key={g.key} className="flex flex-wrap items-center gap-1.5">
            <span className="w-16 shrink-0 text-xs text-muted-foreground">{g.label}</span>
            {g.options.map((o) => {
              const active = (filters[g.key] as string[]).includes(o);
              return (
                <button
                  key={o}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle(g.key, o)}
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                    active ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
                  )}
                >
                  {g.format(o)}
                </button>
              );
            })}
          </div>
        ))}
        {!isDefault && (
          <button
            type="button"
            onClick={() => {
              setFilters(DEFAULT_FILTERS);
              setSearch('');
            }}
            className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-3" /> Reset filters
          </button>
        )}
      </div>

      {sorted.length === 0 ? (
        <EmptyState icon={BugIcon} title={isDefault ? 'No open bugs' : 'No bugs match these filters'}>
          {isDefault ? 'Bugs show up here as soon as a run finds them.' : 'Try removing a filter.'}
        </EmptyState>
      ) : (
        <ul className="divide-y rounded-lg border">
          <li className="flex items-center gap-3 bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
            {canWrite && (
            <Checkbox
              aria-label="Select all shown bugs"
              checked={allSelected ? true : selected.size > 0 ? 'indeterminate' : false}
              onCheckedChange={(v) => setSelected(v === true ? new Set(sorted.map((b) => b.id)) : new Set())}
            />
            )}
            <span>
              {sorted.length} shown{selected.size > 0 && ` · ${selected.size} selected`}
            </span>
          </li>
          {sorted.map((b) => (
            <li key={b.id} className="flex items-center hover:bg-muted/50">
              {canWrite && (
              <div className="flex items-center self-stretch pl-4">
                <Checkbox
                  aria-label={`Select bug ${b.id}`}
                  checked={selected.has(b.id)}
                  onCheckedChange={(v) => toggleSelected(b.id, v === true)}
                />
              </div>
              )}
              <Link
                href={`/w/${workspaceId}/p/${projectId}/b/${b.id}`}
                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-sm focus-visible:bg-muted/50 focus-visible:outline-none"
              >
                <SeverityDot severity={b.severity} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2">
                    <span className="truncate font-medium">{b.title}</span>
                    {!opened.has(b.id) && b.status === 'open' && (
                      <Badge className="h-4 shrink-0 px-1.5 text-[10px]">NEW</Badge>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {bugLocation(b)} · {b.tester} · first seen {relativeTime(b.created_at)}
                    {b.status !== 'open' && ` · ${statusText(b)}`}
                  </p>
                </div>
                <Badge variant="outline" className="hidden sm:inline-flex">
                  {capitalize(b.category)}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {canWrite && selected.size > 0 && (
        <BulkBar
          projectId={projectId}
          ids={[...selected]}
          onDone={() => setSelected(new Set())}
        />
      )}

      {cursor && (
        <Button variant="outline" onClick={() => load(effective, cursor)} disabled={loading} className="self-center">
          Load more
        </Button>
      )}
    </div>
  );
}
