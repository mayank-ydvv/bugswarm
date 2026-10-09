import { NextResponse, type NextRequest } from 'next/server';
import { safeNextPath } from '@/lib/schemas';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const fail = (error: string) => NextResponse.redirect(`${origin}/?error=${error}`);

  const code = searchParams.get('code');
  if (!code) return fail(searchParams.get('error') === 'access_denied' ? 'oauth_denied' : 'missing_code');

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return fail('auth_failed');

  return NextResponse.redirect(`${origin}${safeNextPath(searchParams.get('next'))}`);
}
