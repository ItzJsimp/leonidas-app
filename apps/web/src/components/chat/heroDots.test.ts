import { describe, expect, it } from "vite-plus/test";
import { createHeroDots, HERO_DOT_COUNT, stepHeroDots } from "./heroDots";

describe("heroDots", () => {
  it("builds the same field every time", () => {
    expect(createHeroDots()).toEqual(createHeroDots());
    expect(createHeroDots()).toHaveLength(HERO_DOT_COUNT);
  });

  it("keeps every dot inside the screen after long drift, forward or back", () => {
    const dots = createHeroDots();
    for (const seconds of [3600, 1e6, -3600]) {
      stepHeroDots(dots, seconds);
      for (const dot of dots) {
        expect(dot.x).toBeGreaterThanOrEqual(0);
        expect(dot.x).toBeLessThan(1);
        expect(dot.y).toBeGreaterThanOrEqual(0);
        expect(dot.y).toBeLessThan(1);
      }
    }
  });

  it("moves dots up on average", () => {
    const dots = createHeroDots();
    expect(dots.every((dot) => dot.vy < 0)).toBe(true);
  });
});
