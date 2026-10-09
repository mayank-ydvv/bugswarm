'use client';

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Fades and lifts its children in the first time they enter the viewport. */
export function Reveal({
  children,
  delay = 0,
  className,
  style,
  as: Tag = 'div',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  style?: CSSProperties;
  as?: 'div' | 'p' | 'h1' | 'h2' | 'li' | 'span';
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          el.dataset.shown = 'true';
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag
      ref={ref as never}
      style={{ ...style, transitionDelay: `${delay}ms` }}
      className={cn(
        'translate-y-8 opacity-0 blur-[2px] transition-[opacity,transform,filter] duration-[1100ms] ease-[cubic-bezier(0.16,1,0.3,1)]',
        'data-[shown=true]:translate-y-0 data-[shown=true]:opacity-100 data-[shown=true]:blur-none',
        'motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:blur-none motion-reduce:transition-none',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

type ScrollListener = (scrollY: number, vh: number) => void;
const listeners = new Set<ScrollListener>();
let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    for (const l of listeners) l(window.scrollY, window.innerHeight);
  });
}

/** One shared rAF-throttled scroll listener for every scroll-linked element on the page. */
function useScroll(listener: ScrollListener) {
  useEffect(() => {
    listeners.add(listener);
    if (listeners.size === 1) {
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
    }
    listener(window.scrollY, window.innerHeight);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
      }
    };
  }, [listener]);
}

/**
 * Opacity follows the element's distance from the viewport centre: text fades in as it rises,
 * holds while centred, and fades out as it leaves (the manifesto paragraphs).
 */
export function ScrollFade({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useScroll(
    useStableCallback((_y: number, vh: number) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const distance = Math.abs(rect.top + rect.height / 2 - vh / 2) / (vh * 0.5);
      const opacity = Math.max(0, Math.min(1, 1.35 - distance * 1.5));
      el.style.opacity = String(opacity);
      el.style.transform = `translate3d(0, ${(1 - opacity) * 18}px, 0)`;
      el.style.filter = `blur(${(1 - opacity) * 3}px)`;
    }),
  );
  return (
    <div ref={ref} className={cn('will-change-[opacity,transform] motion-reduce:!opacity-100 motion-reduce:!blur-none', className)}>
      {children}
    </div>
  );
}

function useStableCallback<T extends (...args: never[]) => void>(fn: T): T {
  const ref = useRef(fn);
  ref.current = fn;
  const stable = useRef(((...args: never[]) => ref.current(...args)) as T);
  return stable.current;
}

const TRIANGLE_COLORS = {
  gold: '#ffb829',
  violet: '#8052ff',
  teal: '#2fd3a9',
  white: '#e9e6ff',
  pink: '#ff6fae',
} as const;

/**
 * A large wireframe triangle that drifts at its own depth while the page scrolls, like the foreground
 * shards in the reference. `variant="tetra"` draws a pyramid outline.
 */
export function FloatingTriangle({
  className,
  size = 64,
  color = 'white',
  depth = 0.3,
  rotate = 0,
  spin = 0.04,
  variant = 'tri',
}: {
  className?: string;
  size?: number;
  color?: keyof typeof TRIANGLE_COLORS;
  depth?: number;
  rotate?: number;
  spin?: number;
  variant?: 'tri' | 'tetra';
}) {
  const ref = useRef<SVGSVGElement>(null);
  useScroll(
    useStableCallback((scrollY: number, vh: number) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.parentElement?.getBoundingClientRect();
      const offset = rect ? rect.top + rect.height / 2 - vh / 2 : -scrollY;
      el.style.transform = `translate3d(0, ${offset * depth}px, 0) rotate(${rotate + scrollY * spin}deg)`;
    }),
  );
  const stroke = TRIANGLE_COLORS[color];
  return (
    <svg
      ref={ref}
      aria-hidden="true"
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={cn('pointer-events-none absolute will-change-transform motion-reduce:!transform-none', className)}
      style={{ filter: `drop-shadow(0 0 6px ${stroke}66)` }}
    >
      {variant === 'tri' ? (
        <polygon points="50,8 94,86 6,86" fill="none" stroke={stroke} strokeWidth="5" strokeLinejoin="round" />
      ) : (
        <g fill="none" stroke={stroke} strokeWidth="4" strokeLinejoin="round">
          <polygon points="50,6 92,80 8,80" />
          <polyline points="50,6 58,94 92,80" />
          <line x1="8" y1="80" x2="58" y2="94" />
        </g>
      )}
    </svg>
  );
}
