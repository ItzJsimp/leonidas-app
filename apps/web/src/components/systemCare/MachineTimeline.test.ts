import { describe, expect, it } from "vite-plus/test";

import { markPosition } from "./MachineTimeline";

describe("markPosition", () => {
  const now = 1_000_000_000_000;
  const hour = 3_600_000;

  it("places a mark by its share of the window", () => {
    expect(markPosition(now, now, "24h")).toBe(100);
    expect(markPosition(now - 24 * hour, now, "24h")).toBe(0);
    expect(markPosition(now - 12 * hour, now, "24h")).toBe(50);
  });

  it("drops marks outside the window and bad dates", () => {
    expect(markPosition(now - 2 * hour, now, "1h")).toBeNull();
    expect(markPosition(now + 1, now, "24h")).toBeNull();
    expect(markPosition(Number.NaN, now, "24h")).toBeNull();
  });
});
