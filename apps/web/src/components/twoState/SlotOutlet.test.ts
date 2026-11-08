import { describe, expect, it } from "vite-plus/test";

import { slotRegistry } from "./SlotOutlet";

describe("slotRegistry", () => {
  it("finds the built-in home cards through the *.slot.tsx glob, the dashboard after setup", () => {
    const ids = slotRegistry.ccHome.map((entry) => entry.id);
    // The setup card, then the one dashboard block with its 8 cards, then the older cards.
    expect(ids.slice(0, 2)).toEqual(["finish-setup", "cc-dashboard"]);
    expect(ids).not.toContain("goal-progress");
    // 3 older built-in cards, the dashboard and the Marketing plug-in card.
    expect(slotRegistry.ccHome).toHaveLength(5);
    expect(ids).toContain("marketing-needs-approval");
    expect(slotRegistry.headerStat.map((entry) => entry.id)).toContain("marketing-needs-approval");
  });
});
