import Link from 'next/link';
import { LandingNav } from './landing-nav';
import { LogoMark } from './logo-mark';
import { FloatingTriangle, Reveal, ScrollFade } from './motion';
import { ParticleScene, type Scene } from './particle-scene';
import { SwarmCarousel, type TesterCard } from './swarm-carousel';

/** Each section's particle scene. `mobile` overrides keep the shape centred and dim behind the text. */
const scene = (s: Scene & { mobile?: Partial<Scene> }) => JSON.stringify(s);
// On phones the shape sits behind the copy, so it must stay faint enough to read over.
const MOBILE_BEHIND: Partial<Scene> = { x: 0, y: 0.18, scale: 0.72, alpha: 0.26 };

const TESTERS: TesterCard[] = [
  { label: 'Live app', name: 'Playwright crawler', body: 'Clicks through your app like a user and records console errors, crashes, broken links and layouts that overflow on phones.', color: '#2fd3a9' },
  { label: 'Security', name: 'Semgrep', body: 'Hunts for injection, unsafe eval and risky patterns in the code you just changed.', color: '#ff6fae' },
  { label: 'Secrets', name: 'Gitleaks', body: 'Finds keys and tokens committed by accident, without ever storing the secret itself.', color: '#ffb829' },
  { label: 'Dependencies', name: 'OSV-Scanner', body: 'Flags packages with known vulnerabilities whenever your lockfile changes.', color: '#4f7dff' },
  { label: 'Type checking', name: 'TypeScript', body: 'Catches the type errors that slip past your editor, across the whole project.', color: '#8052ff' },
  { label: 'Code quality', name: 'ESLint', body: 'Your own lint rules, run in a sandbox on every changed file.', color: '#b26bff' },
  { label: 'Performance', name: 'Lighthouse', body: 'Measures slow pages, layout shift and render-blocking resources on every full scan.', color: '#ff9a3c' },
  { label: 'Accessibility', name: 'axe-core', body: 'Reports serious and critical accessibility violations, page by page.', color: '#2fd3a9' },
  { label: 'Logic', name: 'AI review', body: 'Reads changed files and their imports for real logic bugs: wrong conditions, null access, missing returns.', color: '#8052ff' },
  { label: 'Tests', name: 'AI test generation', body: 'Writes unit tests for your exported functions and runs them. Failing assertions become bugs.', color: '#ffb829' },
];

const TOOLS: { name: string; note: string; color: string; x: string; y: string }[] = [
  { name: 'Playwright', note: 'Browser crawler', color: '#ffb829', x: '4%', y: '6%' },
  { name: 'Semgrep', note: 'Security rules', color: '#2fd3a9', x: '28%', y: '20%' },
  { name: 'Lighthouse', note: 'Performance', color: '#ffb829', x: '2%', y: '44%' },
  { name: 'Gitleaks', note: 'Secret scanning', color: '#8052ff', x: '36%', y: '54%' },
  { name: 'OSV-Scanner', note: 'Vulnerable packages', color: '#b26bff', x: '14%', y: '76%' },
  { name: 'axe-core', note: 'Accessibility', color: '#2fd3a9', x: '46%', y: '86%' },
  { name: 'Gemini', note: 'Plain-English explanations', color: '#ff6fae', x: '58%', y: '30%' },
  { name: 'Supabase', note: 'Realtime and storage', color: '#4f7dff', x: '62%', y: '66%' },
];

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] font-semibold tracking-[0.025em] text-[#ffb829] uppercase sm:text-[14px]">{children}</p>;
}

function Body({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-[17px] leading-[1.5] font-extralight text-white/90 sm:text-[18px] ${className}`}>{children}</p>;
}

function Cta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit rounded-[24px] bg-[#8052ff] px-4 py-[13px] text-[14px] font-semibold tracking-[0.025em] text-white uppercase transition-[filter,transform] hover:brightness-110 active:scale-[0.98]"
    >
      {children}
    </Link>
  );
}

export function LandingPage({ signedIn }: { signedIn: boolean }) {
  const cta = signedIn ? { href: '/w', label: 'Open dashboard' } : { href: '/login', label: 'Start testing' };

  return (
    <div className="relative min-h-dvh overflow-x-clip bg-black font-[family-name:var(--font-landing)] text-white antialiased [font-feature-settings:'ss01'] selection:bg-[#8052ff]/60">
      <ParticleScene />
      <LandingNav cta={cta} />

      <main className="relative z-10">
        {/* 1. Hero: the swarm forms a brain on the right. */}
        <section
          data-scene={scene({ shape: 'brain', x: 0.42, y: -0.02, scale: 1.0, camera: 4, alpha: 0.95, yaw: -0.25, mobile: { ...MOBILE_BEHIND, y: 0.42, scale: 0.62 } })}
          className="relative mx-auto flex min-h-dvh max-w-[1280px] items-center px-4 pt-24 pb-16 sm:px-8"
        >
          <FloatingTriangle className="top-[26%] left-[2%]" size={70} color="gold" depth={0.15} rotate={-20} />
          <FloatingTriangle className="top-[9%] left-[42%]" size={34} color="gold" depth={0.4} rotate={15} />
          <FloatingTriangle className="right-[6%] bottom-[12%]" size={48} variant="tetra" color="violet" depth={0.5} rotate={10} />
          <div className="flex max-w-[560px] flex-col gap-6">
            <Reveal as="h1" className="text-[clamp(56px,10vw,113px)] leading-[0.92] font-normal tracking-[-0.04em]">
              Catch
              <br />
              every bug
              <br />
              first.
            </Reveal>
            <Reveal delay={150}>
              <Label>Stop hunting bugs. Start fixing them.</Label>
            </Reveal>
            <Reveal delay={250}>
              <Body className="max-w-[480px]">
                Point BugSwarm at your repo or live site. A swarm of automated testers combs through it around the
                clock, explains every bug in plain English and hands you a ready-to-paste fix prompt.
              </Body>
            </Reveal>
            <Reveal delay={350}>
              <Cta href={cta.href}>{cta.label}</Cta>
            </Reveal>
          </div>
        </section>

        {/* 2. The brain glides left and grows; copy on the right. */}
        <section
          id="features"
          data-scene={scene({ shape: 'brain', x: -0.5, y: 0.02, scale: 1.5, camera: 4, alpha: 0.95, yaw: -0.55, mobile: MOBILE_BEHIND })}
          className="relative mx-auto flex min-h-[130dvh] max-w-[1280px] items-center px-4 sm:px-8"
        >
          <FloatingTriangle className="bottom-[18%] left-[34%]" size={56} variant="tetra" color="white" depth={0.35} rotate={-8} />
          <FloatingTriangle className="top-[30%] right-[4%]" size={40} color="white" depth={0.5} rotate={30} />
          <div className="ml-auto flex max-w-[400px] flex-col gap-5 md:mr-[4%]">
            <Reveal as="h2" className="text-[clamp(32px,4vw,42px)] leading-[1.15] font-normal tracking-[-0.04em]">
              Know exactly
              <br />
              what&apos;s broken
            </Reveal>
            <Reveal delay={120}>
              <Body>
                Ten testers run in parallel on every scan: linters, type checkers, security scanners, a browser crawler
                and AI reviewers.
              </Body>
            </Reveal>
            <Reveal delay={220}>
              <Body>
                Findings are deduplicated, ranked by severity and rewritten in plain English, so you see the bugs that
                matter instead of three hundred warnings.
              </Body>
            </Reveal>
          </div>
        </section>

        {/* 3. Manifesto: the brain bursts into a field you fly through. */}
        <section
          id="manifesto"
          data-scene={scene({ shape: 'field', x: 0, y: 0, scale: 1, camera: 1.6, alpha: 0.75, yaw: 0, mobile: { alpha: 0.5 } })}
          className="relative mx-auto max-w-[900px] px-4 text-center sm:px-8"
        >
          <FloatingTriangle className="top-[8%] right-[2%]" size={90} color="gold" depth={0.6} rotate={25} />
          <FloatingTriangle className="top-[52%] left-[-2%]" size={60} variant="tetra" color="white" depth={0.45} rotate={-12} />
          <FloatingTriangle className="right-[6%] bottom-[10%]" size={46} color="violet" depth={0.3} rotate={50} />
          {[
            [
              'This is your codebase today. Lint warnings, type errors, vulnerable packages and broken pages, scattered across a dozen tools that never talk to each other.',
              'Each one speaks its own language, and turning a wall of warnings into a list of real bugs eats the hours you meant to spend building.',
            ],
            [
              'When something breaks in production, you are the one reproducing it at midnight, piecing together logs, screenshots and guesses.',
              'Your users find the bug before you do.',
            ],
            [
              'Existing tools report problems. They rarely explain them, and they never tell you what to do next.',
              'Testing shouldn’t be another job on your list. It should run itself.',
            ],
          ].map((pair, i) => (
            <div key={i} className="flex min-h-[85dvh] items-center justify-center">
              <ScrollFade className="flex flex-col gap-6">
                {pair.map((p) => (
                  <p key={p} className="text-[clamp(19px,2.2vw,24px)] leading-[1.35] font-normal tracking-[-0.02em] text-white/95">
                    {p}
                  </p>
                ))}
              </ScrollFade>
            </div>
          ))}
        </section>

        {/* 4. The field regroups into a lightbulb on the left. */}
        <section
          data-scene={scene({ shape: 'bulb', x: -0.42, y: -0.05, scale: 1.05, camera: 4, alpha: 0.95, yaw: 0.15, mobile: MOBILE_BEHIND })}
          className="relative mx-auto flex min-h-[140dvh] max-w-[1280px] items-center px-4 sm:px-8"
        >
          <FloatingTriangle className="bottom-[20%] left-[18%]" size={62} color="white" depth={0.4} rotate={180} />
          <FloatingTriangle className="top-[40%] right-[8%]" size={50} variant="tetra" color="white" depth={0.55} rotate={-6} />
          <div className="ml-auto flex max-w-[400px] flex-col gap-5 md:mr-[6%]">
            <Reveal as="h2" className="text-[clamp(32px,4vw,42px)] leading-[1.15] font-normal tracking-[-0.04em]">
              Spark the
              <br />
              fix
            </Reveal>
            <Reveal delay={120}>
              <Body>
                Every bug arrives with its evidence: the exact line of code, a screenshot, a video of the failing click
                and the steps to reproduce it.
              </Body>
            </Reveal>
            <Reveal delay={220}>
              <Body>
                Then BugSwarm writes the prompt. Paste it into Claude Code for a focused fix and a regression test that
                proves it.
              </Body>
            </Reveal>
            <Reveal delay={320}>
              <Body>Select a batch and copy one combined prompt to fix them all, one by one.</Body>
            </Reveal>
          </div>
        </section>

        {/* 5. The bulb becomes a globe on the right: testing around the clock. */}
        <section
          data-scene={scene({ shape: 'globe', x: 0.46, y: 0, scale: 1.25, camera: 4, alpha: 0.95, yaw: 0.4, mobile: MOBILE_BEHIND })}
          className="relative mx-auto flex min-h-[140dvh] max-w-[1280px] items-center px-4 sm:px-8"
        >
          <FloatingTriangle className="top-[34%] left-[40%]" size={52} color="gold" depth={0.4} rotate={-30} />
          <FloatingTriangle className="bottom-[16%] left-[6%]" size={40} variant="tetra" color="gold" depth={0.3} rotate={12} />
          <div className="flex max-w-[400px] flex-col gap-5">
            <Reveal as="h2" className="text-[clamp(32px,4vw,42px)] leading-[1.15] font-normal tracking-[-0.04em]">
              Testing that
              <br />
              never sleeps
            </Reveal>
            <Reveal delay={120}>
              <Body>
                Full scans every night, quick checks every hour, and a fresh scan on every push to GitHub. When nothing
                changed, a check costs nothing.
              </Body>
            </Reveal>
            <Reveal delay={220}>
              <Body>
                Bugs that disappear close themselves, then get <span className="text-[#ffb829]">verified</span> on the
                next full scan. Your list is always the truth.
              </Body>
            </Reveal>
            <Reveal delay={320}>
              <Body>
                Code runs in locked-down sandboxes with no internet access. Secrets it finds are never stored or sent
                to an AI.
              </Body>
            </Reveal>
          </div>
        </section>

        {/* 6. Meet the swarm: carousel of testers over a calm field. */}
        <section
          id="swarm"
          data-scene={scene({ shape: 'field', x: 0, y: 0, scale: 1, camera: 3.2, alpha: 0.38, yaw: 0.8, mobile: { alpha: 0.28 } })}
          className="relative mx-auto flex min-h-[120dvh] max-w-[1280px] items-center px-4 sm:px-8"
        >
          <FloatingTriangle className="top-[22%] right-[30%]" size={44} color="gold" depth={0.5} rotate={-15} />
          <FloatingTriangle className="right-[4%] bottom-[22%]" size={56} variant="tetra" color="white" depth={0.35} />
          <div className="grid w-full gap-12 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:items-center">
            <div className="flex max-w-[420px] flex-col gap-5">
              <Reveal as="h2" className="text-[clamp(48px,6.5vw,78px)] leading-[1] font-normal tracking-[-0.04em]">
                Meet the swarm
              </Reveal>
              <Reveal delay={120}>
                <p className="text-[18px] font-normal">Ten specialists, one bug list.</p>
              </Reveal>
              <Reveal delay={220}>
                <Body className="text-white/80">
                  Each tester does one thing well. BugSwarm runs them side by side, merges what they find and keeps
                  track of every bug from first sighting to verified fix.
                </Body>
              </Reveal>
            </div>
            <Reveal delay={200}>
              <SwarmCarousel cards={TESTERS} />
            </Reveal>
          </div>
        </section>

        {/* 7. Built on tools you trust: names float beside coloured glyphs. */}
        <section
          data-scene={scene({ shape: 'field', x: 0, y: 0, scale: 1, camera: 2.4, alpha: 0.45, yaw: 1.4, mobile: { alpha: 0.28 } })}
          className="relative mx-auto flex min-h-[110dvh] max-w-[1280px] items-center px-4 sm:px-8"
        >
          <div className="grid w-full gap-12 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] md:items-center">
            <ul className="relative order-2 grid grid-cols-2 gap-x-6 gap-y-8 md:order-1 md:block md:h-[480px]">
              {TOOLS.map((t, i) => (
                <Reveal
                  key={t.name}
                  as="li"
                  delay={i * 90}
                  style={{ '--x': t.x, '--y': t.y } as React.CSSProperties}
                  className="md:absolute md:[left:var(--x)] md:[top:var(--y)]"
                >
                  <div className="flex items-center gap-3">
                    <svg viewBox="0 0 100 100" className="size-8 shrink-0" aria-hidden="true" style={{ filter: `drop-shadow(0 0 6px ${t.color}88)` }}>
                      <polygon points="50,8 94,86 6,86" fill="none" stroke={t.color} strokeWidth="7" strokeLinejoin="round" transform={`rotate(${(i * 53) % 360} 50 55)`} />
                    </svg>
                    <span>
                      <span className="block text-[15px] font-normal">{t.name}</span>
                      <span className="block text-[11px] font-extralight text-[#9a9a9a]">{t.note}</span>
                    </span>
                  </div>
                </Reveal>
              ))}
            </ul>
            <div className="order-1 flex max-w-[420px] flex-col gap-5 md:order-2">
              <Reveal as="h2" className="text-[clamp(44px,6vw,78px)] leading-[1] font-normal tracking-[-0.04em]">
                Built on tools you trust
              </Reveal>
              <Reveal delay={150}>
                <Body className="text-white/80">
                  BugSwarm orchestrates proven open-source testers and free-tier AI, and runs them in sandboxes you
                  control.
                </Body>
              </Reveal>
            </div>
          </div>
        </section>

        {/* 8. Closing call to action: the swarm folds into the mark. */}
        <section
          data-scene={scene({ shape: 'fan', x: 0, y: 0.02, scale: 1.05, camera: 4, alpha: 0.9, yaw: -0.3, mobile: { scale: 0.8, alpha: 0.6 } })}
          className="relative flex min-h-dvh flex-col items-center justify-center px-4 text-center"
        >
          <FloatingTriangle className="top-[52%] left-[4%]" size={70} color="gold" depth={0.3} rotate={-25} />
          <FloatingTriangle className="right-[8%] bottom-[16%]" size={64} variant="tetra" color="white" depth={0.45} rotate={20} />
          <Reveal as="h2" className="text-[clamp(30px,4.2vw,48px)] leading-[1.15] font-normal tracking-[-0.03em]">
            Your app has bugs.
            <br />
            Let the swarm find them.
          </Reveal>
          <Reveal delay={200} className="mt-6">
            <Cta href={cta.href}>{cta.label}</Cta>
          </Reveal>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/[0.06] bg-black/60 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1280px] flex-col items-center gap-4 px-4 py-6 text-[12px] text-[#9a9a9a] sm:flex-row sm:justify-between sm:px-8">
          <span className="flex items-center gap-2">
            <LogoMark size={16} />© {new Date().getFullYear()} BugSwarm. All rights reserved.
          </span>
          <nav className="flex gap-6 font-semibold tracking-[0.025em] uppercase" aria-label="Footer">
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#manifesto" className="hover:text-white">Manifesto</a>
            <a href="#swarm" className="hover:text-white">Testers</a>
            <Link href={signedIn ? '/w' : '/login'} className="hover:text-white">
              {signedIn ? 'Dashboard' : 'Sign in'}
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
