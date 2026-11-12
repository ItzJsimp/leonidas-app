import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { AccountDetail, AccountTotals, AccountsView } from "./AccountsView";
import { FIFTEEN, account, stateOf } from "./accounts.fixture";

describe("AccountsView", () => {
  it("lists the open accounts with their options, and shows the totals when nothing is picked", () => {
    const html = renderToStaticMarkup(<AccountsView state={stateOf(FIFTEEN)} />);
    expect(html.split('role="option"').length - 1).toBe(12);
    expect(html).toContain('aria-label="Accounts"');
    expect(html).toContain("All accounts");
    expect(html).toContain("Pass rate");
  });

  it("shows the empty-search message when nothing matches", () => {
    const html = renderToStaticMarkup(<AccountsView state={stateOf([])} />);
    expect(html).toContain("No accounts match");
  });
});

describe("AccountTotals", () => {
  it("reads the totals and the pass rate from the state", () => {
    const html = renderToStaticMarkup(
      <AccountTotals
        state={stateOf([], {
          firmFees: 300,
          totalCost: 420,
          payouts: 250,
          passRate: { passed: 1, finished: 3, rate: 1 / 3 },
        })}
      />,
    );
    expect(html).toContain("$300");
    expect(html).toContain("$420");
    expect(html).toContain("$250");
    expect(html).toContain("33%");
    expect(html).toContain("1 of 3 finished Attempts");
  });
});

describe("AccountDetail", () => {
  it("shows the Attempts, Firm fees and Payouts of the picked account", () => {
    const picked = account(4, { stage: "funded", roomToDrawdown: 300 });
    const state = stateOf([picked], {
      attempts: [
        {
          accountId: "acct-4",
          via: "purchase",
          fee: 100,
          startedAt: "2026-03-01T12:00:00-07:00",
          result: "passed",
          endedAt: "2026-03-05T12:00:00-07:00",
        },
      ],
      moneyTimeline: [
        {
          at: "2026-03-01T12:00:00-07:00",
          category: "evaluation",
          accountId: "acct-4",
          amount: -100,
          netReturn: -100,
        },
        {
          at: "2026-03-09T12:00:00-07:00",
          category: "payout",
          accountId: "acct-4",
          amount: 250,
          netReturn: 150,
        },
      ],
    });
    const html = renderToStaticMarkup(<AccountDetail state={state} account={picked} />);
    expect(html).toContain("Purchase");
    expect(html).toContain("Mar 1");
    expect(html).toContain("Passed");
    expect(html).toContain("$100 Firm fees");
    expect(html).toContain("$250 total");
  });
});
