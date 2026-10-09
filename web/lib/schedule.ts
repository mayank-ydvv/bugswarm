import type { Schedule } from './schemas';

// Must match the pg_cron jobs (Phase 4): hourly at :07, nightly at 02:13 UTC.
const HOURLY_MINUTE = 7;
const NIGHTLY_HOUR = 2;
const NIGHTLY_MINUTE = 13;

/** Next time the scheduler will enqueue a run for this project, or null if scheduling is off. */
export function nextScheduledRun(schedule: Schedule, now: Date = new Date()): Date | null {
  if (schedule === 'off') return null;
  const next = new Date(now);
  next.setUTCSeconds(0, 0);
  if (schedule === 'hourly') {
    next.setUTCMinutes(HOURLY_MINUTE);
    if (next <= now) next.setUTCHours(next.getUTCHours() + 1);
    return next;
  }
  next.setUTCHours(NIGHTLY_HOUR, NIGHTLY_MINUTE);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}
