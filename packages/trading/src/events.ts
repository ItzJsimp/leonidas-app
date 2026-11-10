export type AccountStage = "sim" | "evaluation" | "funded";
export type CostCategory =
  | "evaluation"
  | "reset"
  | "activation"
  | "mentorship"
  | "data"
  | "tools"
  | "other";

interface EventBase {
  readonly id: string;
  /** ISO time as the trader's local clock wrote it. The month of a cost is read from this text. */
  readonly at: string;
  readonly author: string;
}

/**
 * The fee on `attempt.started` and `funded.opened` counts as a Firm fee by itself.
 * Do not write a matching `cost.paid`: that event is for a fee with no Attempt.
 */
export type TradingEvent = EventBase &
  (
    | {
        readonly kind: "account.opened";
        readonly firm: string;
        readonly product: string;
        readonly size: string;
        readonly platform: string;
        readonly last4: string;
        readonly stage: AccountStage;
      }
    | {
        readonly kind: "attempt.started";
        readonly accountId: string;
        readonly via: "purchase" | "reset";
        readonly fee: number;
      }
    | {
        readonly kind: "attempt.ended";
        readonly accountId: string;
        readonly result: "passed" | "failed";
      }
    | {
        readonly kind: "funded.opened";
        readonly accountId: string;
        readonly fromAccountId: string;
        readonly activationFee: number;
      }
    | {
        readonly kind: "account.closed";
        readonly accountId: string;
        readonly reason: "drawdown" | "rule" | "manual";
      }
    | {
        readonly kind: "cost.paid";
        readonly category: CostCategory;
        readonly amount: number;
        readonly accountId?: string;
      }
    | { readonly kind: "payout.received"; readonly accountId: string; readonly amount: number }
    | {
        readonly kind: "trade.tagged";
        readonly tradeId: string;
        readonly setup?: string;
        readonly ruleBreaks?: readonly string[];
        readonly screenshot?: string;
      }
    | {
        readonly kind: "entry.corrected";
        readonly targetId: string;
        readonly patch: Readonly<Record<string, unknown>>;
      }
    | { readonly kind: "entry.deleted"; readonly targetId: string }
  );

/** One line of `trading/trades.jsonl`. `id` is platform plus trade Id. `pnl` is net of fees. */
export interface Trade {
  readonly id: string;
  readonly accountId: string;
  readonly day: string;
  readonly at: string;
  readonly pnl: number;
  readonly contract?: string;
  readonly side?: string;
  readonly size?: number;
  readonly points?: number;
  readonly setup?: string;
  readonly ruleBreaks?: readonly string[];
}

export interface LineIssue {
  readonly line: number;
  readonly reason: string;
}

type Check = (v: unknown) => boolean;
type Fields = Readonly<Record<string, Check>>;

const MAX_TEXT = 500;
const MAX_MONEY = 1_000_000_000;

const text: Check = (v) => typeof v === "string" && v.trim() !== "" && v.length <= MAX_TEXT;
const money: Check = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_MONEY;
const signedNumber: Check = (v) =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= MAX_MONEY;
const textList: Check = (v) => Array.isArray(v) && v.length <= 50 && v.every(text);
const isoTime: Check = (v) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v));
const isoDay: Check = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const record: Check = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const oneOf =
  (...allowed: readonly string[]): Check =>
  (v) =>
    typeof v === "string" && allowed.includes(v);

const COST_CATEGORIES = [
  "evaluation",
  "reset",
  "activation",
  "mentorship",
  "data",
  "tools",
  "other",
];

const EVENT_SHAPES = new Map<string, { req: Fields; opt?: Fields }>([
  [
    "account.opened",
    {
      req: {
        firm: text,
        product: text,
        size: text,
        platform: text,
        last4: text,
        stage: oneOf("sim", "evaluation", "funded"),
      },
    },
  ],
  ["attempt.started", { req: { accountId: text, via: oneOf("purchase", "reset"), fee: money } }],
  ["attempt.ended", { req: { accountId: text, result: oneOf("passed", "failed") } }],
  ["funded.opened", { req: { accountId: text, fromAccountId: text, activationFee: money } }],
  ["account.closed", { req: { accountId: text, reason: oneOf("drawdown", "rule", "manual") } }],
  [
    "cost.paid",
    { req: { category: oneOf(...COST_CATEGORIES), amount: money }, opt: { accountId: text } },
  ],
  ["payout.received", { req: { accountId: text, amount: money } }],
  [
    "trade.tagged",
    { req: { tradeId: text }, opt: { setup: text, ruleBreaks: textList, screenshot: text } },
  ],
  ["entry.corrected", { req: { targetId: text, patch: record } }],
  ["entry.deleted", { req: { targetId: text } }],
]);

const EVENT_BASE: Fields = { id: text, at: isoTime, author: text, kind: text };

const TRADE_REQ: Fields = {
  id: text,
  accountId: text,
  day: isoDay,
  at: isoTime,
  pnl: signedNumber,
};
const TRADE_OPT: Fields = {
  contract: text,
  side: text,
  size: signedNumber,
  points: signedNumber,
  setup: text,
  ruleBreaks: textList,
};

/** Returns a reason, or null when the object fits. An unknown key fails. */
function shapeError(value: unknown, req: Fields, opt: Fields = {}): string | null {
  if (!record(value)) return "needs an object";
  const object = value as Record<string, unknown>;
  for (const key of Object.keys(object)) {
    if (!Object.hasOwn(req, key) && !Object.hasOwn(opt, key)) return `unknown key ${key}`;
    const check = Object.hasOwn(req, key) ? req[key] : opt[key];
    if (check && !check(object[key])) return `bad value for ${key}`;
  }
  for (const key of Object.keys(req)) {
    if (!Object.hasOwn(object, key)) return `missing ${key}`;
  }
  return null;
}

/** Returns the event, or the reason it is not valid. */
export function parseEvent(value: unknown): TradingEvent | string {
  const kind = record(value) ? (value as { kind?: unknown }).kind : undefined;
  const shape = typeof kind === "string" ? EVENT_SHAPES.get(kind) : undefined;
  if (!shape) return "unknown event kind";
  const error = shapeError(value, { ...EVENT_BASE, ...shape.req }, shape.opt);
  return error ?? (value as TradingEvent);
}

/** Returns the trade, or the reason it is not a valid line of `trades.jsonl`. */
export function parseTrade(value: unknown): Trade | string {
  return shapeError(value, TRADE_REQ, TRADE_OPT) ?? (value as Trade);
}

/** A bad, torn or repeated line is skipped and reported, and later lines still load. */
function parseLines<T extends { readonly id: string }>(
  fileText: string,
  parse: (value: unknown) => T | string,
): { readonly items: T[]; readonly issues: LineIssue[] } {
  const items: T[] = [];
  const issues: LineIssue[] = [];
  const seen = new Set<string>();
  const lines = fileText.replace(/^﻿/, "").split("\n");
  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (line === "") return;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      issues.push({ line: index + 1, reason: "not valid JSON" });
      return;
    }
    const parsed = parse(value);
    if (typeof parsed === "string") {
      issues.push({ line: index + 1, reason: parsed });
    } else if (seen.has(parsed.id)) {
      issues.push({ line: index + 1, reason: "repeated id" });
    } else {
      seen.add(parsed.id);
      items.push(parsed);
    }
  });
  return { items, issues };
}

export function parseLedger(fileText: string) {
  const { items, issues } = parseLines(fileText, parseEvent);
  return { events: items, issues };
}

export function parseTrades(fileText: string) {
  const { items, issues } = parseLines(fileText, parseTrade);
  return { trades: items, issues };
}

export const serializeTrade = (trade: Trade): string => `${JSON.stringify(trade)}\n`;

export const serializeEvent = (event: TradingEvent): string => `${JSON.stringify(event)}\n`;
