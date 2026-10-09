import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { redirect } from 'next/navigation';
import { LandingPage } from '@/components/landing/landing-page';
import { missingPublicEnv } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';

// The design calls for PP Neue Montreal; Inter is its stated substitute (weights 200 / 400 / 600).
const landingFont = Inter({ subsets: ['latin'], weight: ['200', '400', '600'], variable: '--font-landing', display: 'swap' });

export const metadata: Metadata = {
  title: { absolute: 'BugSwarm: catch every bug first' },
  description:
    'A swarm of automated testers combs through your repo and live app, explains every bug in plain English and hands you a ready-to-paste fix prompt.',
};

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string; error_code?: string }> }) {
  // When Supabase can't use the requested redirect (e.g. an expired sign-in attempt) it falls back
  // to the Site URL, this page, with the error in the query. Show it on the sign-in page instead.
  const { error, error_code } = await searchParams;
  if (error) {
    redirect(`/login?error=${error_code === 'bad_oauth_state' ? 'oauth_expired' : error === 'access_denied' ? 'oauth_denied' : 'auth_failed'}`);
  }
  let signedIn = false;
  if (missingPublicEnv().length === 0) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    signedIn = Boolean(data?.claims);
  }
  return (
    <div className={landingFont.variable}>
      <LandingPage signedIn={signedIn} />
    </div>
  );
}
