import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogoMark } from '@/components/landing/logo-mark';
import { ParticleScene } from '@/components/landing/particle-scene';
import { missingPublicEnv } from '@/lib/env';
import { safeNextPath } from '@/lib/schemas';
import { createClient } from '@/lib/supabase/server';
import { SignInForm } from '../sign-in-form';

const font = Inter({ subsets: ['latin'], weight: ['200', '400', '600'], variable: '--font-landing', display: 'swap' });

export const metadata: Metadata = { title: 'Sign in' };

const AUTH_ERRORS: Record<string, string> = {
  missing_code: 'Sign-in was interrupted. Please try again.',
  auth_failed: 'Could not complete sign-in. Please try again.',
  oauth_denied: 'GitHub sign-in was cancelled.',
  oauth_expired: 'That sign-in attempt expired. Please try again.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const missing = missingPublicEnv();

  if (missing.length === 0) {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (data?.claims) redirect(safeNextPath(next));
  }

  return (
    // `dark` switches the shadcn form controls to their dark tokens on this page.
    <div className={`${font.variable} dark relative min-h-dvh overflow-hidden bg-black font-[family-name:var(--font-landing)] text-white`}>
      <ParticleScene />
      <div
        aria-hidden="true"
        data-scene={JSON.stringify({ shape: 'field', x: 0, y: 0, scale: 1, camera: 3, alpha: 0.32, yaw: 0.6 })}
        className="absolute inset-0"
      />
      <header className="relative z-10 mx-auto flex h-20 max-w-[1280px] items-center px-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2 text-[15px] text-white">
          <LogoMark />
          BugSwarm
        </Link>
      </header>
      <main className="relative z-10 flex min-h-[calc(100dvh-5rem)] items-center justify-center px-4 pb-16">
        <div className="w-full max-w-[400px]">
          <h1 className="text-[clamp(36px,6vw,48px)] leading-[1.1] font-normal tracking-[-0.04em]">Sign in</h1>
          <p className="mt-3 mb-8 text-[17px] font-extralight text-white/80">
            Your swarm is waiting. Use GitHub or your email.
          </p>
          <div className="rounded-[24px] bg-white/[0.03] p-6 ring-1 ring-white/10 backdrop-blur-md">
            {missing.length > 0 ? (
              <p className="text-sm text-red-400">
                Supabase is not configured. Set {missing.join(', ')} in <code>.env</code> (see README).
              </p>
            ) : (
              <SignInForm next={safeNextPath(next)} oauthError={error ? AUTH_ERRORS[error] : undefined} />
            )}
          </div>
          <p className="mt-6 text-center text-[13px] text-[#9a9a9a]">
            <Link href="/" className="hover:text-white">
              ← Back to bugswarm
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
