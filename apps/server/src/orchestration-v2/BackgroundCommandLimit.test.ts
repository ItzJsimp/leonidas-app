import { describe, expect, it } from "vite-plus/test";

import {
  cacheWakeDue,
  extendedLimitMs,
  initialLimitMs,
  keptTaskIds,
} from "./BackgroundCommandLimit.ts";

const MINUTE = 60_000;

describe("time limit", () => {
  it("defaults to 30 minutes and caps the agent's own limit at 4 hours", () => {
    expect(initialLimitMs(undefined)).toBe(30 * MINUTE);
    expect(initialLimitMs(5 * MINUTE)).toBe(5 * MINUTE);
    expect(initialLimitMs(600 * MINUTE)).toBe(240 * MINUTE);
  });

  it("extends 30 minutes from now and never past 4 hours", () => {
    expect(extendedLimitMs(0, 31 * MINUTE)).toBe(61 * MINUTE);
    expect(extendedLimitMs(0, 235 * MINUTE)).toBe(240 * MINUTE);
  });
});

describe("cacheWakeDue", () => {
  const hour = { expiresAtMs: 60 * MINUTE, ttlMs: 60 * MINUTE };

  it("wakes near 50 minutes for a 1 hour cache", () => {
    expect(cacheWakeDue(hour, 49 * MINUTE)).toBe(false);
    expect(cacheWakeDue(hour, 50 * MINUTE)).toBe(true);
    expect(cacheWakeDue(hour, 60 * MINUTE)).toBe(false);
  });

  it("leaves a cache shorter than 30 minutes to expire", () => {
    expect(cacheWakeDue({ expiresAtMs: 5 * MINUTE, ttlMs: 5 * MINUTE }, 4 * MINUTE)).toBe(false);
    expect(cacheWakeDue(null, 0)).toBe(false);
  });
});

describe("keptTaskIds", () => {
  it("keeps only the commands the reply names", () => {
    expect(keptTaskIds("The build is healthy.\nKEEP `b1`.\n", ["b1", "b2"])).toEqual(["b1"]);
    expect(keptTaskIds("I will keep b2 in mind.", ["b2"])).toEqual([]);
  });
});
