import type { TradingAccountView } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

import { RiskView } from "./RiskView";
import type { ReadyRules } from "./risk.logic";

// Made-up pack values and firm. The real numbers stay in the private pack repo.
const RULES: ReadyRules = {
  status: "ready",
  riskStates: [
    {
      id: "evaluation",
      market: "NQ",
      contracts: 2,
      stopPoints: 12,
      targetPoints: 20,
      stopDollars: 480,
      targetDollars: 800,
    },
  ],
  firstDay: null,
  limits: {},
};

const ACCOUNT: TradingAccountView = {
  id: "a1",
  firm: "Firm A",
  product: "Plan 1",
  size: "50K",
  platform: "TopstepX",
  last4: "0001",
  stage: "evaluation",
  closedReason: null,
  balanceChange: 0,
  roomToDrawdown: 300,
  profitTarget: null,
  winningDays: null,
  bestDayPercent: null,
  consistencyPercent: null,
};

describe("RiskView", () => {
  it("teaches how to link a pack and offers only the position size calculator without one", () => {
    const html = renderToStaticMarkup(<RiskView accounts={[ACCOUNT]} rules={null} />);
    expect(html).toContain("Link a pack folder");
    expect(html).toContain('href="/settings/general"');
    expect(html).toContain("Position size");
    expect(html).not.toContain("Expected value");
    expect(html).not.toContain("Bankroll");
    expect(html).not.toContain("Stop");
  });

  it("shows the plan of each open account and a warning when the stop breaks the room", () => {
    const html = renderToStaticMarkup(
      <RiskView
        accounts={[ACCOUNT, { ...ACCOUNT, id: "a2", closedReason: "rule" }]}
        rules={RULES}
      />,
    );
    expect(html).toContain("12 points, $480");
    expect(html).toContain("2 NQ, 20 MNQ");
    expect(html.match(/Firm A/g)?.length).toBe(1);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Room to Drawdown is $300");
    expect(html).toContain("Expected value");
    expect(html).toContain("Bankroll");
  });
});
