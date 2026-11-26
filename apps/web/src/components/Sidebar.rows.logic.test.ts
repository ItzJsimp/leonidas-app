import { describe, expect, it } from "vite-plus/test";
import { sidebarCacheWarmth, sidebarCacheWarmthKey } from "./Sidebar.logic.ts";

const NOW = Date.parse("2026-11-08T12:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();
const usage = (anchorMinutesAgo: number, ttlMs = 60 * 60_000) =>
  ({
    usedTokens: 1000,
    inputTokens: 1000,
    cachedInputTokens: 900,
    promptCacheTtlMs: ttlMs,
    promptCacheAnchorAt: minutesAgo(anchorMinutesAgo),
    reportedAt: minutesAgo(anchorMinutesAgo),
  }) as never;

describe("sidebarCacheWarmthKey", () => {
  it("stays the same between 30 second ticks, so rows do not re-render", () => {
    expect(sidebarCacheWarmthKey(usage(5), NOW + 30_000)).toBe(
      sidebarCacheWarmthKey(usage(5), NOW),
    );
  });
  it("changes when the minute label changes", () => {
    expect(sidebarCacheWarmthKey(usage(5), NOW + 60_000)).not.toBe(
      sidebarCacheWarmthKey(usage(5), NOW),
    );
  });
  it("is empty without cache data", () => {
    expect(sidebarCacheWarmthKey(null, NOW)).toBe("");
  });
});

describe("sidebarCacheWarmth", () => {
  it("counts down from the last model call", () => {
    expect(sidebarCacheWarmth(usage(5), NOW)).toMatchObject({ label: "Cache 55m", low: false });
  });
  it("warns under ten minutes", () => {
    expect(sidebarCacheWarmth(usage(56), NOW)).toMatchObject({ label: "Cache 4m left", low: true });
  });
  it("says Cold after the lifetime ends", () => {
    expect(sidebarCacheWarmth(usage(90), NOW)).toEqual({ fraction: 0, label: "Cold", low: false });
  });
  it("falls back to the report time when no anchor was stored", () => {
    const old = { ...(usage(5) as object), promptCacheAnchorAt: undefined } as never;
    expect(sidebarCacheWarmth(old, NOW)).toMatchObject({ label: "Cache 55m" });
  });
  it("shows nothing without a lifetime or a report", () => {
    expect(sidebarCacheWarmth(null, NOW)).toBeNull();
    expect(sidebarCacheWarmth({ usedTokens: 5 } as never, NOW)).toBeNull();
  });
});
