import * as Schema from "effect/Schema";

import { AiosWorkspaceId } from "./taskBoard.ts";

/** The Trading workspace to read. Absent means the first Trading workspace. */
export const TradingStateInput = Schema.Struct({ workspaceId: Schema.optional(AiosWorkspaceId) });
export type TradingStateInput = typeof TradingStateInput.Type;

const AccountStage = Schema.Literals(["sim", "evaluation", "funded"]);
const NullableNumber = Schema.NullOr(Schema.Number);

export const TradingAccountView = Schema.Struct({
  id: Schema.String,
  firm: Schema.String,
  product: Schema.String,
  size: Schema.String,
  platform: Schema.String,
  last4: Schema.String,
  stage: AccountStage,
  closedReason: Schema.NullOr(Schema.Literals(["drawdown", "rule", "manual"])),
  balanceChange: Schema.Number,
  roomToDrawdown: NullableNumber,
  profitTarget: NullableNumber,
  winningDays: NullableNumber,
  bestDayPercent: NullableNumber,
});

const TradingAttempt = Schema.Struct({
  accountId: Schema.String,
  via: Schema.Literals(["purchase", "reset"]),
  fee: Schema.Number,
  startedAt: Schema.String,
  result: Schema.Literals(["open", "passed", "failed"]),
  endedAt: Schema.NullOr(Schema.String),
});

const TradingMoneyPoint = Schema.Struct({
  at: Schema.String,
  category: Schema.String,
  amount: Schema.Number,
  netReturn: Schema.Number,
});

const TradingMonthTotals = Schema.Struct({
  month: Schema.String,
  firmFees: Schema.Number,
  totalCost: Schema.Number,
  payouts: Schema.Number,
  netReturn: Schema.Number,
});

const TradingSetupStats = Schema.Struct({
  setup: Schema.String,
  trades: Schema.Number,
  wins: Schema.Number,
  pnl: Schema.Number,
});

/** The derived Trading state. Every number comes from `deriveTradingState` in the trading package. */
export const TradingState = Schema.Struct({
  accounts: Schema.Array(TradingAccountView),
  attempts: Schema.Array(TradingAttempt),
  passRate: Schema.Struct({ passed: Schema.Number, finished: Schema.Number, rate: NullableNumber }),
  firmFees: Schema.Number,
  totalCost: Schema.Number,
  payouts: Schema.Number,
  netReturn: Schema.Number,
  costByCategory: Schema.Record(Schema.String, Schema.Number),
  averageFundedCost: NullableNumber,
  lowestRoom: Schema.NullOr(Schema.Struct({ accountId: Schema.String, room: Schema.Number })),
  moneyTimeline: Schema.Array(TradingMoneyPoint),
  months: Schema.Array(TradingMonthTotals),
  setups: Schema.Array(TradingSetupStats),
  streaks: Schema.Struct({ clean: Schema.Number, bestClean: Schema.Number }),
  journey: Schema.Literals(["sim", "evaluation", "funded", "payouts"]),
  issues: Schema.Array(Schema.Struct({ eventId: Schema.String, reason: Schema.String })),
});
export type TradingState = typeof TradingState.Type;

export const TradingStateResult = Schema.Struct({
  state: TradingState,
  /** Lines in the ledger or trades file that were skipped as unreadable. */
  skippedLines: Schema.Number,
});
export type TradingStateResult = typeof TradingStateResult.Type;

export class TradingStateError extends Schema.TaggedError<TradingStateError>()(
  "TradingStateError",
  { reason: Schema.Literals(["workspace_not_found", "not_a_trading_workspace", "read_failed"]) },
) {
  override get message() {
    return `Trading state unavailable: ${this.reason}`;
  }
}
