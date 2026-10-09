import { createBrowserClient } from '@supabase/ssr';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/** One browser client per tab so Realtime channels share a socket. */
export function createClient() {
  client ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return client;
}

/**
 * Subscribe to a Realtime channel as the signed-in user. On a fresh page load the session
 * arrives as INITIAL_SESSION, which supabase-js does not forward to Realtime, so the channel
 * would join anonymously and RLS would silently drop every event. Returns an unsubscribe fn.
 */
export function subscribeAsUser(
  name: string,
  configure: (channel: RealtimeChannel) => RealtimeChannel,
): () => void {
  const supabase = createClient();
  let channel: RealtimeChannel | null = null;
  let cancelled = false;

  void (async () => {
    const { data } = await supabase.auth.getSession();
    if (cancelled) return;
    if (data.session) await supabase.realtime.setAuth(data.session.access_token);
    if (cancelled) return;
    // Unique topic per subscription: supabase.channel() returns an existing channel with the same
    // topic, and a remount (StrictMode, Fast Refresh) can run before the old one is removed; adding
    // postgres_changes handlers to an already-subscribed channel silently does nothing.
    channel = configure(supabase.channel(`${name}:${crypto.randomUUID()}`)).subscribe();
  })();

  return () => {
    cancelled = true;
    if (channel) void supabase.removeChannel(channel);
  };
}
