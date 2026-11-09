import { describe, expect, it } from "vite-plus/test";

import { slotRegistry } from "./SlotOutlet";

describe("slotRegistry", () => {
  it("finds the built-in home cards through the *.slot.tsx glob, the dashboard after setup", () => {
    const ids = slotRegistry.ccHome.map((entry) => entry.id);
    // The setup card, then the one dashboard block with its 8 cards, then the older cards.
    expect(ids.slice(0, 2)).toEqual(["finish-setup", "cc-dashboard"]);
    expect(ids).not.toContain("goal-progress");
    // The setup card, the dashboard and the 2 business workspace cards. Marketing has none.
    expect(slotRegistry.ccHome).toHaveLength(4);
    expect(ids).not.toContain("marketing-needs-approval");
    expect(slotRegistry.headerStat.map((entry) => entry.id)).toContain("marketing-needs-approval");
  });
});
