import { deriveTradingState, type TradingEvent } from "@t3tools/trading";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { MoneyView } from "./MoneyView";

vi.mock("./useTradingSettingsSave", () => ({
  useTradingSettingsSave: () => async () => null,
}));

// The cap view reads the current month, so the made-up events use this month.
const now = new Date();
const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
const at = (day: number) => `${month}-${String(day).padStart(2, "0")}T12:00:00-07:00`;
const EVENTS: readonly TradingEvent[] = [
  {
    id: "a1",
    at: at(1),
    author: "Test",
    kind: "account.opened",
    firm: "Firm A",
    product: "Plan 1",
    size: "50K",
    platform: "Platform",
    last4: "0001",
    stage: "evaluation",
  },
  {
    id: "a2",
    at: at(1),
    author: "Test",
    kind: "attempt.started",
    accountId: "a1",
    via: "purchase",
    fee: 100,
  },
  { id: "p1", at: at(3), author: "Test", kind: "payout.received", accountId: "a1", amount: 300 },
];

const render = (monthlyFeeCap: number | null, settingsUnreadable = false) =>
  renderToStaticMarkup(
    <MoneyView
      state={deriveTradingState({ events: EVENTS, trades: [] })}
      settings={{
        monthlyFeeCap,
        traderName: null,
        share: { journey: true, habits: true, payouts: false, money: false },
        crewSync: false,
      }}
      settingsUnreadable={settingsUnreadable}
      onEditEntries={() => {}}
    />,
  );

describe("MoneyView", () => {
  it("shows the markers, the empty cap line, the funded cost note and the entries action", () => {
    const html = render(null);
    expect(html).toContain("Payout +$300");
    expect(html).toContain("Fee -$100");
    expect(html).toContain("tabular-nums");
    expect(html).toContain("No cap set.");
    expect(html).toContain("Not enough data yet");
    expect(html).toContain("Edit entries");
  });

  it("warns in text at exactly 100 percent of the cap and says when the file is unreadable", () => {
    expect(render(100)).toContain("Warning: $100 of $100 used (100%).");
    expect(render(null, true)).toContain("cannot be read");
  });
});
