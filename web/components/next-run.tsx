'use client';

import { useSyncExternalStore } from 'react';
import { nextScheduledRun } from '@/lib/schedule';
import type { Schedule } from '@/lib/schemas';

const subscribe = () => () => {};

/** Rendered on the client only so the time shows in the viewer's own timezone. */
export function NextRun({ schedule, prefix = 'Next run' }: { schedule: Schedule; prefix?: string }) {
  const label = useSyncExternalStore(
    subscribe,
    () => {
      const next = nextScheduledRun(schedule);
      if (!next) return 'Scheduling off';
      const fmt = new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      });
      return `${prefix}: ${fmt.format(next)}`;
    },
    () => '',
  );
  return <span suppressHydrationWarning>{label}</span>;
}
