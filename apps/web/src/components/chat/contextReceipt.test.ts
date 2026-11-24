import { describe, expect, it } from "vite-plus/test";
import { compactionReceiptDetail, formatTokenCount, handoffStrategyLabel } from "./contextReceipt";

describe("formatTokenCount", () => {
  it("formats small, thousand and million counts", () => {
    expect(formatTokenCount(950)).toBe("950");
    expect(formatTokenCount(411_000)).toBe("411k");
    expect(formatTokenCount(1_250_000)).toBe("1.3M");
  });
});

describe("compactionReceiptDetail", () => {
  it("shows before and after", () => {
    expect(compactionReceiptDetail(411_000, 68_000)).toBe("411k → 68k tokens");
  });
  it("marks a missing side with a question mark", () => {
    expect(compactionReceiptDetail(411_000, undefined)).toBe("411k → ? tokens");
  });
  it("returns null with no counts", () => {
    expect(compactionReceiptDetail(undefined, undefined)).toBeNull();
  });
});

describe("handoffStrategyLabel", () => {
  it("names every strategy in plain words", () => {
    expect(handoffStrategyLabel("full_thread_summary")).toBe("Summary of the whole chat");
    expect(handoffStrategyLabel("delta_since_target_last_seen")).toContain("changed");
  });
});
