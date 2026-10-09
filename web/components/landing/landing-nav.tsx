'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { LogoMark } from './logo-mark';

const LINKS = [
  { id: 'features', label: 'Features' },
  { id: 'manifesto', label: 'Manifesto' },
  { id: 'swarm', label: 'Testers' },
];

export function LandingNav({ cta }: { cta: { href: string; label: string } }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const sections = LINKS.map((l) => document.getElementById(l.id)).filter((s): s is HTMLElement => Boolean(s));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id);
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-30 bg-gradient-to-b from-black/85 via-black/50 to-transparent">
      <nav className="mx-auto flex h-20 max-w-[1280px] items-center justify-between px-4 sm:px-8" aria-label="Main">
        <Link href="/" className="flex items-center gap-2 text-[15px] font-normal tracking-tight text-white">
          <LogoMark />
          BugSwarm
        </Link>
        <div className="flex items-center gap-1 sm:gap-6">
          <ul className="hidden items-center gap-7 md:flex">
            {LINKS.map((l) => (
              <li key={l.id}>
                <a
                  href={`#${l.id}`}
                  className={cn(
                    'text-[14px] font-semibold tracking-[0.025em] uppercase transition-colors hover:text-white',
                    active === l.id ? 'text-white' : 'text-[#9a9a9a]',
                  )}
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <Link
            href={cta.href}
            className="rounded-[24px] bg-[#8052ff] px-4 py-[11px] text-[13px] font-semibold tracking-[0.025em] text-white uppercase transition-[filter,transform] hover:brightness-110 active:scale-[0.98] sm:text-[14px]"
          >
            {cta.label}
          </Link>
        </div>
      </nav>
    </header>
  );
}
