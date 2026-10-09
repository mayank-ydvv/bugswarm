import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '@/lib/database.types';
import { publicEnv } from '@/lib/env';

/** Service-role client: bypasses RLS. Server routes only (GitHub webhook in Phase 4). */
export function createAdminClient() {
  const key = z.string().min(20).parse(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return createClient<Database>(publicEnv().NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
