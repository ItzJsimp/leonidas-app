import { describe, expect, it } from "vite-plus/test";
import { staleCacheTokens, staleTokensAt } from "./staleCacheBanner";

describe("staleCacheTokens", () => {
  it("returns the token count for an expired cache over the floor", () => {
    expect(staleCacheTokens({ cacheState: "possibly-expired", usedTokens: 411_000 })).toBe(411_000);
  });
  it("returns null under the 200k floor", () => {
    expect(staleCacheTokens({ cacheState: "possibly-expired", usedTokens: 199_999 })).toBeNull();
  });
  it("returns null while the cache is warm or unknown", () => {
    expect(staleCacheTokens({ cacheState: "estimated", usedTokens: 411_000 })).toBeNull();
    expect(staleCacheTokens({ cacheState: "unknown", usedTokens: 411_000 })).toBeNull();
  });
  it("returns null for missing or invalid tokens", () => {
    expect(staleCacheTokens({ cacheState: "possibly-expired", usedTokens: null })).toBeNull();
    expect(staleCacheTokens({ cacheState: "possibly-expired", usedTokens: Number.NaN })).toBeNull();
  });
});

describe("staleTokensAt", () => {
  const T0 = 1_000_000;
  const input = {
    observation: {
      inputTokens: 2_000,
      cachedInputTokens: 1_000,
      reportedAt: T0,
      ttlMs: 3_600_000,
      anchorAt: T0,
    },
    usedTokens: 411_000,
    enabled: true,
  };
  it("keeps one snapshot across clock ticks while the cache is warm", () => {
    expect(staleTokensAt(input, T0 + 1_000)).toBeNull();
    expect(staleTokensAt(input, T0 + 1_800_000)).toBeNull();
  });
  it("changes once, when the cache expires, then holds", () => {
    expect(staleTokensAt(input, T0 + 3_600_000)).toBe(411_000);
    expect(staleTokensAt(input, T0 + 3_630_000)).toBe(411_000);
  });
  it("stays null when disabled", () => {
    expect(staleTokensAt({ ...input, enabled: false }, T0 + 3_700_000)).toBeNull();
  });
});
