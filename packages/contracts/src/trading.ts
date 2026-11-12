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
  check: Schema.optional(Schema.Literals(["waiting", "graded"])),
});
export type TradingTradeView = typeof TradingTradeView.Type;

const TradingPackPrices = Schema.Struct({
  monthly: NullableNumber,
  activation: NullableNumber,
  reset: NullableNumber,
  oneTime: NullableNumber,
});

/** Firm presets for the Add forms. The full pack stays on the server. */
const TradingPackFirm = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  products: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      size: Schema.Number,
      prices: TradingPackPrices,
    }),
  ),
});

/** The pack linked in workspace.json. `check.sha256` is the module hash the consent prompt shows. */
export const TradingPackView = Schema.Union([
  Schema.Struct({ status: Schema.Literal("none") }),
  Schema.Struct({
    status: Schema.Literal("invalid"),
    folder: Schema.String,
    reason: Schema.String,
  }),
  Schema.Struct({
    status: Schema.Literal("ready"),
    folder: Schema.String,
    firms: Schema.Array(TradingPackFirm),
    check: Schema.Struct({
      status: Schema.Literals(["none", "missing", "pending", "allowed", "declined"]),
      module: Schema.NullOr(Schema.String),
      sha256: Schema.NullOr(Schema.String),
    }),
  }),
]);
export type TradingPackView = typeof TradingPackView.Type;

export const TradingStateResult = Schema.Struct({
  pack: TradingPackView,
  state: TradingState,
  /** The newest trades, newest first, for the Journal. */
  trades: Schema.Array(TradingTradeView),
  /** Lines in the ledger or trades file that were skipped as unreadable. */
  skippedLines: Schema.Number,
  /** The live ledger events after corrections, newest first, at most 50, without `trade.tagged`. */
  entries: Schema.Array(Schema.Record(Schema.String, Schema.Unknown)),
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
      "pack_not_found",
      "pack_changed",
      "invalid_event",
      "page_not_found",
      "invalid_resource",
    ]),
    detail: Schema.optional(Schema.String),
  },
) {
  override get message() {
    return `Trading state unavailable: ${this.reason}${this.detail ? ` (${this.detail})` : ""}`;
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

/** The rule check at import. `off` means no pack check module; `pending` and `declined` skip it. */
const TradingImportCheck = Schema.Literals([
  "off",
  "pending",
  "declined",
  "waiting",
  "graded",
  "failed",
]);

export const TradingImportResult = Schema.Struct({
  check: TradingImportCheck,
  added: Schema.Number,
  duplicates: Schema.Number,
  skippedRows: Schema.Number,
});
export type TradingImportResult = typeof TradingImportResult.Type;

/** The trader's answer for the check module whose hash the prompt showed. */
export const TradingPackConsentInput = Schema.Struct({
  workspaceId: Schema.optional(AiosWorkspaceId),
  allow: Schema.Boolean,
  sha256: Schema.String,
});
export type TradingPackConsentInput = typeof TradingPackConsentInput.Type;

/** Events to add to the ledger. The server accepts 1 to 3, checks each, and sets the author. */
export const TradingAppendInput = Schema.Struct({
  workspaceId: Schema.optional(AiosWorkspaceId),
  events: Schema.Array(Schema.Record(Schema.String, Schema.Unknown)).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(3),
  ),
});
export type TradingAppendInput = typeof TradingAppendInput.Type;

export const TradingAppendResult = Schema.Struct({ appended: Schema.Number });
export type TradingAppendResult = typeof TradingAppendResult.Type;

/** The Library reads the linked pack. Absent `workspaceId` means the first Trading workspace. */
export const TradingLibraryInput = Schema.Struct({ workspaceId: Schema.optional(AiosWorkspaceId) });
export type TradingLibraryInput = typeof TradingLibraryInput.Type;

const LibraryLessonView = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  duration: Schema.String,
  keywords: Schema.Array(Schema.String),
  hasTranscript: Schema.Boolean,
  url: Schema.NullOr(Schema.String),
});

const LibraryPageView = Schema.Struct({ id: Schema.String, title: Schema.String });

/** The Library index. `status: none` means no pack is linked; `invalid` gives the reason. */
export const TradingLibraryIndexResult = Schema.Struct({
  status: Schema.Literals(["none", "ready", "invalid"]),
  reason: Schema.NullOr(Schema.String),
  chapters: Schema.Array(
    Schema.Struct({
      number: Schema.String,
      title: Schema.String,
      lessons: Schema.Array(LibraryLessonView),
    }),
  ),
  knowledge: Schema.Array(LibraryPageView),
  community: Schema.Array(LibraryPageView),
  firms: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      fetchDate: Schema.NullOr(Schema.String),
      stale: Schema.Boolean,
    }),
  ),
  cards: Schema.Array(
    Schema.Struct({ front: Schema.String, back: Schema.String, citation: Schema.String }),
  ),
  quiz: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      topic: Schema.String,
      level: Schema.String,
      source: Schema.String,
      prompt: Schema.String,
      correct: Schema.Number,
      options: Schema.Array(Schema.Struct({ text: Schema.String, why: Schema.String })),
    }),
  ),
});
export type TradingLibraryIndexResult = typeof TradingLibraryIndexResult.Type;

export const TradingLibraryPageInput = Schema.Struct({
  workspaceId: Schema.optional(AiosWorkspaceId),
  kind: Schema.Literals(["lesson", "knowledge", "firm", "community"]),
  id: Schema.String.check(Schema.isMaxLength(80)),
});
export type TradingLibraryPageInput = typeof TradingLibraryPageInput.Type;

/** One page of text. `truncated` is true when the text was cut at 200,000 characters. */
export const TradingLibraryPageResult = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  text: Schema.String,
  truncated: Schema.Boolean,
});
export type TradingLibraryPageResult = typeof TradingLibraryPageResult.Type;

export const TradingLibrarySearchInput = Schema.Struct({
  workspaceId: Schema.optional(AiosWorkspaceId),
  query: Schema.String.check(Schema.isMaxLength(200)),
});
export type TradingLibrarySearchInput = typeof TradingLibrarySearchInput.Type;

export const TradingLibrarySearchResult = Schema.Struct({
  hits: Schema.Array(
    Schema.Struct({
      kind: Schema.Literals(["lesson", "knowledge", "card", "community"]),
      id: Schema.String,
      title: Schema.String,
      snippet: Schema.String,
    }),
  ),
});
export type TradingLibrarySearchResult = typeof TradingLibrarySearchResult.Type;

export const TradingResourceKind = Schema.Literals(["link", "note", "pdf", "discord", "call"]);

export const TradingResourceSaveInput = Schema.Struct({
  workspaceId: Schema.optional(AiosWorkspaceId),
  kind: TradingResourceKind,
  title: Schema.String.check(Schema.isMaxLength(200)),
  url: Schema.optional(Schema.String.check(Schema.isMaxLength(2_000))),
  text: Schema.optional(Schema.String.check(Schema.isMaxLength(20_000))),
  /** Private stays in `trading/resources`. Otherwise the item goes to the Crew outbox. */
  private: Schema.Boolean,
});
export type TradingResourceSaveInput = typeof TradingResourceSaveInput.Type;

export const TradingResourceSaveResult = Schema.Struct({ id: Schema.String });
export type TradingResourceSaveResult = typeof TradingResourceSaveResult.Type;

export const TradingResourceListResult = Schema.Struct({
  resources: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      kind: TradingResourceKind,
      title: Schema.String,
      url: Schema.NullOr(Schema.String),
      private: Schema.Boolean,
      savedAt: Schema.String,
    }),
  ),
});
export type TradingResourceListResult = typeof TradingResourceListResult.Type;
