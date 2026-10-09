import 'server-only';
import { notFound } from 'next/navigation';
import { z } from 'zod';

/** Route ids are uuids; anything else is a 404 rather than a Postgres cast error. */
export function uuidParam(value: string): string {
  const r = z.uuid().safeParse(value);
  if (!r.success) notFound();
  return r.data;
}
