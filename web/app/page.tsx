import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
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

export default async function Home() {
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
