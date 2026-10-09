'use client';

import { useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TesterCard {
  label: string;
  name: string;
  body: string;
  color: string;
}

/** Glyph art standing in for a portrait: nested triangles in the tester's colour. */
function Glyph({ color, seed }: { color: string; seed: number }) {
  const shards = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * Math.PI * 2 + seed;
    const r = 30 + ((i * 37 + seed * 11) % 18);
    return { x: 100 + Math.cos(a) * r, y: 110 + Math.sin(a) * r * 0.8, s: 6 + ((i * 7 + seed) % 9), rot: (i * 47 + seed * 31) % 360 };
  });
  return (
    <svg viewBox="0 0 200 220" className="h-full w-full" aria-hidden="true">
      <defs>
        <radialGradient id={`g${seed}`} cx="50%" cy="50%" r="60%">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="200" height="220" fill={`url(#g${seed})`} />
      <polygon points="100,52 154,148 46,148" fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
      <polygon points="100,80 132,136 68,136" fill="none" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.5" strokeLinejoin="round" />
      {shards.map((t, i) => (
        <polygon
          key={i}
          points={`${t.x},${t.y - t.s} ${t.x + t.s},${t.y + t.s * 0.75} ${t.x - t.s},${t.y + t.s * 0.75}`}
          fill="none"
          stroke={i % 3 === 0 ? '#ffb829' : color}
          strokeWidth="1.3"
          transform={`rotate(${t.rot} ${t.x} ${t.y})`}
        />
      ))}
    </svg>
  );
}

export function SwarmCarousel({ cards }: { cards: TesterCard[] }) {
  const [index, setIndex] = useState(0);
  const go = (d: number) => setIndex((i) => (i + d + cards.length) % cards.length);
  const card = cards[index]!;
  const next = cards[(index + 1) % cards.length]!;

  return (
    <div className="flex flex-col gap-8">
      <div className="relative flex items-end gap-6" aria-live="polite">
        <figure key={index} className="flex animate-[swarm-in_700ms_cubic-bezier(0.16,1,0.3,1)] flex-col gap-5 motion-reduce:animate-none sm:flex-row sm:items-end sm:gap-6">
          <div className="aspect-[200/220] w-[min(52vw,260px)] overflow-hidden rounded-[24px] bg-black">
            <Glyph color={card.color} seed={index + 1} />
          </div>
          <figcaption className="max-w-[320px] pb-2 sm:max-w-[220px]">
            <p className="text-[12px] font-normal tracking-[0.05em] text-[#8052ff] uppercase">{card.label}</p>
            <p className="mt-1 text-[27px] leading-none font-normal tracking-[-0.02em] text-white">{card.name}</p>
            <p className="mt-3 text-[15px] leading-[1.45] font-extralight text-[#bdbdbd]">{card.body}</p>
          </figcaption>
        </figure>
        {/* The next card peeks in, dimmed, like the reference carousel. */}
        <div aria-hidden="true" className="pointer-events-none absolute -right-40 bottom-0 hidden aspect-[200/220] w-[200px] overflow-hidden rounded-[24px] opacity-25 lg:block">
          <Glyph color={next.color} seed={((index + 1) % cards.length) + 1} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous tester"
          className="grid size-8 place-items-center rounded-full bg-[#8052ff] text-white transition hover:brightness-110"
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next tester"
          className="grid size-8 place-items-center rounded-full bg-[#8052ff] text-white transition hover:brightness-110"
        >
          <ChevronRightIcon className="size-4" />
        </button>
        <ol className="ml-3 flex gap-1.5" aria-label="Testers">
          {cards.map((c, i) => (
            <li key={c.name}>
              <button
                type="button"
                aria-label={`Show ${c.name}`}
                aria-current={i === index}
                onClick={() => setIndex(i)}
                className={cn('block size-2 rounded-full transition-colors', i === index ? 'bg-[#8052ff]' : 'bg-white/20 hover:bg-white/40')}
              />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
