/**
 * Point clouds for the landing page particle field. Every particle has a position in every shape, so
 * the scene can morph between shapes. Deterministic (seeded) so the page looks the same each load.
 */

export const SHAPES = ['brain', 'field', 'bulb', 'globe', 'fan'] as const;
export type ShapeName = (typeof SHAPES)[number];
export const SHAPE_INDEX: Record<ShapeName, number> = { brain: 0, field: 1, bulb: 2, globe: 3, fan: 4 };

type RGB = [number, number, number];
const hex = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255,
];

const GOLD = hex('#ffb829');
const AMBER = hex('#ff9a3c');
const WHITE = hex('#f4f1ff');
const VIOLET = hex('#8052ff');
const PURPLE = hex('#b26bff');
const TEAL = hex('#2fd3a9');
const BLUE = hex('#4f7dff');
const PINK = hex('#ff6fae');
const PEACH = hex('#ffb08a');

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weighted(rand: () => number, palette: [RGB, number][]): RGB {
  const total = palette.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [c, w] of palette) {
    r -= w;
    if (r <= 0) return c;
  }
  return palette[0]![0];
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Uniform direction on the unit sphere. */
function sphereDir(rand: () => number): [number, number, number] {
  const u = rand() * 2 - 1;
  const th = rand() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  return [s * Math.cos(th), u, s * Math.sin(th)];
}

interface Sample {
  p: [number, number, number];
  c: RGB;
}

function brain(rand: () => number): Sample {
  const roll = rand();
  if (roll < 0.035) {
    // brain stem: short and slim, tucked under the back
    const t = rand();
    const a = rand() * Math.PI * 2;
    const r = 0.11 - t * 0.03;
    return { p: [0.35 + t * 0.08 + Math.cos(a) * r, -0.62 - t * 0.5, Math.sin(a) * r], c: weighted(rand, [[WHITE, 2], [VIOLET, 1], [GOLD, 1]]) };
  }
  if (roll < 0.17) {
    // cerebellum, back-bottom
    const [x, y, z] = sphereDir(rand);
    return { p: [0.75 + x * 0.42, -0.55 + y * 0.24, z * 0.62], c: weighted(rand, [[GOLD, 3], [WHITE, 2], [PURPLE, 1]]) };
  }
  const [dx, dy, dz] = sphereDir(rand);
  // Gyri: ridges that make the surface read as a brain rather than a ball.
  const folds =
    0.07 * Math.sin(9 * dx + 4 * Math.sin(6 * dy)) * Math.cos(8 * dz + 2 * dy) +
    0.035 * Math.sin(17 * dy + 11 * dz);
  let x = dx * 1.38 * (1 + folds);
  let y = dy * 1.08 * (1 + folds);
  let z = dz * 1.08 * (1 + folds);
  if (y < -0.45) y = -0.45 + (y + 0.45) * 0.45; // flatter underside
  if (Math.abs(z) < 0.07 && y > 0) y -= 0.12 * (1 - Math.abs(z) / 0.07); // fissure between hemispheres
  const inner = rand() < 0.12 ? 0.75 + rand() * 0.2 : 1;
  x *= inner;
  y *= inner;
  z *= inner;
  // Amber rim at the outline, white/violet/teal inside, like the reference.
  const rim = Math.max(Math.abs(dy) > 0.55 ? 1 : 0, Math.abs(dx) > 0.82 ? 1 : 0);
  const c = rim
    ? weighted(rand, [[GOLD, 6], [WHITE, 2], [PURPLE, 1]])
    : weighted(rand, [[WHITE, 4], [GOLD, 3], [VIOLET, 2], [TEAL, 1.3], [PINK, 0.8], [BLUE, 0.8]]);
  return { p: [x, y + 0.1, z], c };
}

function field(rand: () => number): Sample {
  return {
    p: [(rand() - 0.5) * 9, (rand() - 0.5) * 6, (rand() - 0.5) * 10],
    c: weighted(rand, [[GOLD, 4], [WHITE, 3], [PURPLE, 2], [TEAL, 1], [PINK, 1], [BLUE, 1]]),
  };
}

function bulb(rand: () => number): Sample {
  const roll = rand();
  let x: number;
  let y: number;
  let z: number;
  if (roll < 0.72) {
    // glass: sphere with a tapered lower half
    const [dx, dy, dz] = sphereDir(rand);
    const taper = dy < 0 ? 1 + dy * 0.52 : 1;
    x = dx * 1.05 * taper;
    z = dz * 1.05 * taper;
    y = 0.45 + dy * (dy < 0 ? 1.2 : 1.0);
  } else {
    // neck and screw base
    const t = rand();
    const a = rand() * Math.PI * 2;
    const thread = t > 0.35 ? 0.035 * Math.sin(t * 60) : 0;
    const r = 0.43 - t * 0.1 + thread;
    x = Math.cos(a) * r;
    z = Math.sin(a) * r;
    y = -0.7 - t * 0.85;
  }
  // amber top -> white -> violet -> teal neck
  const h = (y + 1.7) / 2.6;
  let c: RGB;
  if (h > 0.75) c = mix(WHITE, GOLD, (h - 0.75) / 0.25);
  else if (h > 0.45) c = mix(PEACH, WHITE, (h - 0.45) / 0.3);
  else if (h > 0.22) c = mix(PURPLE, PEACH, (h - 0.22) / 0.23);
  else c = mix(TEAL, VIOLET, h / 0.22);
  if (rand() < 0.08) c = weighted(rand, [[GOLD, 1], [TEAL, 1], [PINK, 1]]);
  // tilt like the reference
  const tilt = 0.42;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  return { p: [x * ct - y * st, x * st + y * ct, z], c };
}

function globe(rand: () => number): Sample {
  const [dx, dy, dz] = sphereDir(rand);
  const land = Math.sin(3.1 * dx + 1.7) * Math.cos(2.3 * dz - 0.5) + Math.sin(4.2 * dy + 2.1 * dx);
  const r = 1.25 * (rand() < 0.1 ? 0.9 + rand() * 0.08 : 1);
  const c =
    land > 0.35
      ? weighted(rand, [[GOLD, 5], [AMBER, 1], [WHITE, 1]])
      : weighted(rand, [[VIOLET, 3], [PURPLE, 2], [TEAL, 2], [BLUE, 1]]);
  // a bright cluster on the near side
  if (dx < -0.55 && dy > -0.2 && dy < 0.35 && rand() < 0.6) return { p: [dx * r, dy * r, dz * r], c: WHITE };
  return { p: [dx * r, dy * r, dz * r], c };
}

/** Four curved quarter-disc petals: the closing shape. */
function fan(rand: () => number): Sample {
  const petal = Math.floor(rand() * 4);
  const petals: { start: number; color: [RGB, RGB]; tiltX: number; tiltY: number; shift: [number, number] }[] = [
    { start: Math.PI * 0.5, color: [TEAL, hex('#7cf2c8')], tiltX: 0.5, tiltY: 0.1, shift: [0, 0.05] },
    { start: Math.PI, color: [BLUE, hex('#7aa0ff')], tiltX: 0.1, tiltY: -0.6, shift: [-0.05, 0] },
    { start: 0, color: [VIOLET, PURPLE], tiltX: -0.3, tiltY: 0.6, shift: [0.05, 0.02] },
    { start: Math.PI * 1.5, color: [AMBER, PEACH], tiltX: -0.6, tiltY: -0.2, shift: [0.02, -0.05] },
  ];
  const p = petals[petal]!;
  const a = p.start + rand() * (Math.PI / 2);
  const r = Math.sqrt(rand()) * 1.25;
  let x = Math.cos(a) * r + p.shift[0];
  let y = Math.sin(a) * r + p.shift[1];
  let z = r * r * 0.35;
  // tilt each petal so it reads as a 3D fan
  const cx = Math.cos(p.tiltX);
  const sx = Math.sin(p.tiltX);
  [y, z] = [y * cx - z * sx, y * sx + z * cx];
  const cy = Math.cos(p.tiltY);
  const sy = Math.sin(p.tiltY);
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  const c = rand() < 0.06 ? WHITE : mix(p.color[1], p.color[0], r / 1.25);
  return { p: [x, y, z], c };
}

const GENERATORS = [brain, field, bulb, globe, fan];

export interface ParticleData {
  count: number;
  /** One Float32Array of xyz per shape, in SHAPES order. */
  positions: Float32Array[];
  colors: Float32Array[];
  /** x: stagger, y: rotation seed, z: size jitter, w: 1 = ambient (never joins a shape). */
  seeds: Float32Array;
}

export function buildParticles(count: number, ambientShare = 0.12): ParticleData {
  const positions = GENERATORS.map(() => new Float32Array(count * 3));
  const colors = GENERATORS.map(() => new Float32Array(count * 3));
  const seeds = new Float32Array(count * 4);
  const rand = mulberry32(0xb065a);
  for (let i = 0; i < count; i++) {
    const ambient = rand() < ambientShare;
    const drift = ambient ? field(rand) : null;
    GENERATORS.forEach((gen, s) => {
      const sample = drift ?? gen(rand);
      positions[s]!.set(sample.p, i * 3);
      // ambient specks stay dim so they read as depth, not content
      const dim = ambient ? 0.55 : 1;
      colors[s]!.set([sample.c[0] * dim, sample.c[1] * dim, sample.c[2] * dim], i * 3);
    });
    seeds.set([rand(), rand(), rand(), ambient ? 1 : 0], i * 4);
  }
  return { count, positions, colors, seeds };
}
