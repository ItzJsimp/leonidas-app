/** Slow drifting dots behind the new chat hero. Positions are 0..1 so a resize needs no rebuild. */

export interface HeroDot {
  x: number;
  y: number;
  /** Drift per second, in screen widths and heights. */
  vx: number;
  vy: number;
  /** Radius in CSS pixels. */
  r: number;
  alpha: number;
}

export const HERO_DOT_COUNT = 70;

/** Seeded, so the field looks the same on every open and in tests. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createHeroDots(count = HERO_DOT_COUNT, seed = 7): HeroDot[] {
  const random = mulberry32(seed);
  return Array.from({ length: count }, () => ({
    x: random(),
    y: random(),
    vx: (random() - 0.5) * 0.012,
    // A slight upward bias reads as rising embers, not noise.
    vy: -0.004 - random() * 0.01,
    r: 0.8 + random() * 1.6,
    alpha: 0.15 + random() * 0.45,
  }));
}

/** Moves every dot by `seconds` and wraps it back in at the opposite edge. */
export function stepHeroDots(dots: HeroDot[], seconds: number): void {
  for (const dot of dots) {
    dot.x = (((dot.x + dot.vx * seconds) % 1) + 1) % 1;
    dot.y = (((dot.y + dot.vy * seconds) % 1) + 1) % 1;
  }
}
