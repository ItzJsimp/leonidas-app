import type { TradingPackView, TradingState } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { accountFee, findProduct, presetFirms, sizeLabel } from "./packPresets";

// A made-up pack. Real firm prices stay in the private pack.
const PACK: TradingPackView = {
  status: "ready",
  folder: "C:/packs/test",
  firms: [
    {
      id: "firm-a",
      name: "Firm A",
      products: [
        {
          id: "plan-1",
          name: "Plan 1",
          size: 50000,
          prices: { monthly: 10, activation: 20, reset: 15, oneTime: null },
        },
        {
          id: "plan-2",
          name: "Plan 2",
          size: 1500,
          prices: { monthly: null, activation: null, reset: null, oneTime: 30 },
        },
      ],
    },
  ],
  check: { status: "none", module: null, sha256: null },
};
const account = (product: string) =>
  ({
    id: "a1",
    firm: "Firm A",
    product,
    size: "50K",
    platform: "TopstepX",
    last4: "0001",
    stage: "evaluation",
    closedReason: null,
    balanceChange: 0,
    roomToDrawdown: null,
    profitTarget: null,
    winningDays: null,
    bestDayPercent: null,
  }) satisfies TradingState["accounts"][number];

describe("pack presets", () => {
  it("has no presets without a linked pack, or with a bad one", () => {
    expect(presetFirms({ status: "none" })).toEqual([]);
    expect(presetFirms({ status: "invalid", folder: "x", reason: "bad" })).toEqual([]);
    expect(presetFirms(undefined)).toEqual([]);
    expect(accountFee([], account("Plan 1"), "reset")).toBe("");
  });

  it("fills each fee from the account's firm and product", () => {
    const firms = presetFirms(PACK);
    expect(findProduct(firms, "Firm A", "Plan 1")?.id).toBe("plan-1");
    expect(accountFee(firms, account("Plan 1"), "purchase")).toBe("10");
    expect(accountFee(firms, account("Plan 1"), "reset")).toBe("15");
    expect(accountFee(firms, account("Plan 1"), "activation")).toBe("20");
    expect(accountFee(firms, account("Plan 2"), "purchase")).toBe("30");
    expect(accountFee(firms, account("Plan 2"), "reset")).toBe("");
    expect(accountFee(firms, account("Other plan"), "purchase")).toBe("");
  });

  it("names sizes the way traders do", () => {
    expect(sizeLabel(50000)).toBe("50K");
    expect(sizeLabel(150000)).toBe("150K");
    expect(sizeLabel(1500)).toBe("1500");
  });
});
