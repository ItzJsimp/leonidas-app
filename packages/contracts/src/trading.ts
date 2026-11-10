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
export type TradingAccountView = typeof TradingAccountView.Type;

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

/** One imported trade, as `trading/trades.jsonl` stores it. `pnl` is net of fees. */
export const TradingTradeView = Schema.Struct({
  id: Schema.String,
  accountId: Schema.String,
  day: Schema.String,
  at: Schema.String,
  pnl: Schema.Number,
  contract: Schema.optional(Schema.String),
  side: Schema.optional(Schema.String),
  size: Schema.optional(Schema.Number),
  points: Schema.optional(Schema.Number),
  setup: Schema.optional(Schema.String),
  ruleBreaks: Schema.optional(Schema.Array(Schema.String)),
});
export type TradingTradeView = typeof TradingTradeView.Type;

export const TradingStateResult = Schema.Struct({
  state: TradingState,
  /** The newest trades, newest first, for the Journal. */
  trades: Schema.Array(TradingTradeView),
  /** Lines in the ledger or trades file that were skipped as unreadable. */
  skippedLines: Schema.Number,
});
export type TradingStateResult = typeof TradingStateResult.Type;

export class TradingStateError extends Schema.TaggedError<TradingStateError>()(
  "TradingStateError",
  {
    reason: Schema.Literals([
      "workspace_not_found",
      "not_a_trading_workspace",
      "read_failed",
      "file_not_found",
      "not_an_export",
      "unknown_account",
    ]),
  },
) {
  override get message() {
    return `Trading state unavailable: ${this.reason}`;
  }
}

/** A TopstepX Trades export in the import folder with trades this workspace does not have yet. */
export const TradingImportFile = Schema.Struct({
  name: Schema.String,
  trades: Schema.Number,
  firstDay: Schema.NullOr(Schema.String),
  lastDay: Schema.NullOr(Schema.String),
});
export type TradingImportFile = typeof TradingImportFile.Type;

export const TradingImportsResult = Schema.Struct({ files: Schema.Array(TradingImportFile) });
export type TradingImportsResult = typeof TradingImportsResult.Type;

/** Imports one export file (a plain name in the import folder) into one open account. */
export const TradingImportInput = Schema.Struct({
  workspaceId: Schema.optional(AiosWorkspaceId),
  file: Schema.String,
  accountId: Schema.String,
});
export type TradingImportInput = typeof TradingImportInput.Type;

export const TradingImportResult = Schema.Struct({
  added: Schema.Number,
  duplicates: Schema.Number,
  skippedRows: Schema.Number,
});
export type TradingImportResult = typeof TradingImportResult.Type;
