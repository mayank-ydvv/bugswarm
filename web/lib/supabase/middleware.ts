import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/database.types';

const PROTECTED_PREFIXES = ['/w', '/invite'];

/** Refreshes the auth cookie and sends signed-out visitors of app pages back to `/`. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Not configured yet: let `/` render its setup notice.
  if (!url || !key) return isProtected(request) ? redirectHome(request) : response;

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
      },
    },
  });

  // getClaims verifies the JWT; do not run code between client creation and this call.
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims && isProtected(request)) return redirectHome(request);
  return response;
}

function isProtected(request: NextRequest) {
  const p = request.nextUrl.pathname;
  return PROTECTED_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

function redirectHome(request: NextRequest) {
  const url = request.nextUrl.clone();
  const next = request.nextUrl.pathname + request.nextUrl.search;
  url.pathname = '/';
  url.search = `?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url);
}
