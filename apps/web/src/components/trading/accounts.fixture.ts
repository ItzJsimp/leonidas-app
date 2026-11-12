import type { TradingAccountView, TradingState } from "@t3tools/contracts";

// Invented accounts and numbers for the Accounts tests. Real firm rules stay in the private pack.
export const account = (
  id: number,
  overrides: Partial<TradingAccountView> = {},
): TradingAccountView => ({
  id: `acct-${id}`,
  firm: id % 2 === 0 ? "Firm A" : "Firm B",
  product: "Plan 1",
  size: "50K",
  platform: "Platform",
  last4: String(1000 + id),
  stage: "sim",
  closedReason: null,
  balanceChange: 0,
  roomToDrawdown: 1000,
  profitTarget: null,
  winningDays: null,
  bestDayPercent: null,
  consistencyPercent: null,
  ...overrides,
});

// 15 accounts: 12 open (3 Sim, 5 Evaluation, 4 Funded) and 3 closed.
export const FIFTEEN: readonly TradingAccountView[] = [
  account(1, { roomToDrawdown: 900 }),
  account(2, { roomToDrawdown: 500 }),
  account(3, { roomToDrawdown: 700 }),
  account(4, { stage: "evaluation", roomToDrawdown: 300, profitTarget: 3000, balanceChange: 750 }),
  account(5, { stage: "evaluation", roomToDrawdown: 1200, profitTarget: 3000 }),
  account(6, { stage: "evaluation", roomToDrawdown: 450 }),
  account(7, { stage: "evaluation", roomToDrawdown: null }),
  account(8, { stage: "evaluation", roomToDrawdown: 800, closedReason: "manual" }),
  account(9, { stage: "funded", roomToDrawdown: 600, winningDays: 2 }),
  account(10, { stage: "funded", roomToDrawdown: 250 }),
  account(11, {
    stage: "funded",
    roomToDrawdown: 1000,
    consistencyPercent: 40,
    bestDayPercent: 55,
  }),
  account(12, { stage: "funded", roomToDrawdown: null }),
  account(13, { roomToDrawdown: 50, closedReason: "drawdown" }),
  account(14, { stage: "funded", roomToDrawdown: 150, closedReason: "rule" }),
  account(15, { stage: "evaluation", roomToDrawdown: 2000 }),
];

export const stateOf = (
  accounts: readonly TradingAccountView[],
  extra: Partial<TradingState> = {},
): TradingState => ({
  accounts,
  attempts: [],
  passRate: { passed: 0, finished: 0, rate: null },
  firmFees: 0,
  totalCost: 0,
  payouts: 0,
  netReturn: 0,
  costByCategory: {},
  averageFundedCost: null,
  lowestRoom: null,
  moneyTimeline: [],
  months: [],
  setups: [],
  streaks: { clean: 0, bestClean: 0 },
  journey: "evaluation",
  issues: [],
  ...extra,
});
