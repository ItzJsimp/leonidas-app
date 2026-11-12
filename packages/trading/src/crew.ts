// A crew card is what one trader shares with the Crew. The builder adds a group only when the
// trader shared it. Cards from other traders are untrusted input: the reader is strict.
import type { Trade } from "./events.ts";
import type { TradingState } from "./derive.ts";

export interface ShareSettings {
  readonly journey: boolean;
  readonly habits: boolean;
  readonly payouts: boolean;
  readonly money: boolean;
}

/** Journey and Habit stats on, Payouts and money off: the trader opts in to any dollar group. */
export const DEFAULT_SHARE: ShareSettings = {
  journey: true,
  habits: true,
  payouts: false,
  money: false,
};

export interface CrewCard {
  readonly version: 1;
  /** File name part: lowercase letters, digits and dashes. */
  readonly trader: string;
  readonly name: string;
  readonly updatedAt: string;
  readonly journey?: {
    readonly stage: TradingState["journey"];
    readonly passRate: { readonly passed: number; readonly finished: number };
    readonly accounts: {
      readonly sim: number;
      readonly evaluation: number;
      readonly funded: number;
    };
  };
  readonly habits?: {
    readonly cleanStreak: number;
    readonly bestClean: number;
    readonly tradingDays: number;
  };
  readonly payouts?: { readonly count: number; readonly total: number };
  readonly money?: {
    readonly firmFees: number;
    readonly totalCost: number;
    readonly netReturn: number;
  };
}

const MAX_NAME = 40;

/** A safe file name part from a trader name. Never empty. */
export function traderSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_NAME)
    .replace(/-+$/g, "");
  return slug === "" ? "trader" : slug;
}

export function buildCrewCard(input: {
  readonly state: TradingState;
  readonly trades: readonly Trade[];
  readonly name: string;
  readonly share: ShareSettings;
  readonly now: Date;
}): CrewCard {
  const { state, share } = input;
  const name = input.name.trim().slice(0, MAX_NAME) || "Trader";
  const open = state.accounts.filter((account) => account.closedReason === null);
  const count = (stage: string) => open.filter((account) => account.stage === stage).length;
  const payoutPoints = state.moneyTimeline.filter((point) => point.category === "payout");
  return {
    version: 1,
    trader: traderSlug(name),
    name,
    updatedAt: input.now.toISOString(),
    ...(share.journey
      ? {
          journey: {
            stage: state.journey,
            passRate: { passed: state.passRate.passed, finished: state.passRate.finished },
            accounts: {
              sim: count("sim"),
              evaluation: count("evaluation"),
              funded: count("funded"),
            },
          },
        }
      : {}),
    ...(share.habits
      ? {
          habits: {
            cleanStreak: state.streaks.clean,
            bestClean: state.streaks.bestClean,
            tradingDays: new Set(input.trades.map((trade) => trade.day)).size,
          },
        }
      : {}),
    ...(share.payouts ? { payouts: { count: payoutPoints.length, total: state.payouts } } : {}),
    ...(share.money
      ? {
          money: {
            firmFees: state.firmFees,
            totalCost: state.totalCost,
            netReturn: state.netReturn,
          },
        }
      : {}),
  };
}

type Obj = Record<string, unknown>;
const MAX_CARD_BYTES = 20_000;

function only(value: unknown, keys: readonly string[]): Obj | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const object = value as Obj;
  return Object.keys(object).every((key) => keys.includes(key)) ? object : null;
}

const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1_000_000;
const money = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1_000_000_000;

/** Null for anything that is not a valid card: bad JSON, unknown key, wrong type, too large. */
export function parseCrewCard(text: string): CrewCard | null {
  if (text.length > MAX_CARD_BYTES) return null;
  let value: unknown;
  try {
    value = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch {
    return null;
  }
  const card = only(value, [
    "version",
    "trader",
    "name",
    "updatedAt",
    "journey",
    "habits",
    "payouts",
    "money",
  ]);
  if (!card || card.version !== 1) return null;
  const { trader, name, updatedAt } = card;
  if (typeof trader !== "string" || traderSlug(trader) !== trader) return null;
  if (typeof name !== "string" || name === "" || name.length > MAX_NAME) return null;
  if (typeof updatedAt !== "string" || Number.isNaN(Date.parse(updatedAt))) return null;

  const out: { -readonly [K in keyof CrewCard]: CrewCard[K] } = {
    version: 1,
    trader,
    name,
    updatedAt,
  };
  if (card.journey !== undefined) {
    const group = only(card.journey, ["stage", "passRate", "accounts"]);
    const pass = group && only(group.passRate, ["passed", "finished"]);
    const accounts = group && only(group.accounts, ["sim", "evaluation", "funded"]);
    if (
      !group ||
      !pass ||
      !accounts ||
      !["sim", "evaluation", "funded", "payouts"].includes(group.stage as string) ||
      !count(pass.passed) ||
      !count(pass.finished) ||
      !count(accounts.sim) ||
      !count(accounts.evaluation) ||
      !count(accounts.funded)
    ) {
      return null;
    }
    out.journey = {
      stage: group.stage as TradingState["journey"],
      passRate: { passed: pass.passed, finished: pass.finished },
      accounts: { sim: accounts.sim, evaluation: accounts.evaluation, funded: accounts.funded },
    };
  }
  if (card.habits !== undefined) {
    const group = only(card.habits, ["cleanStreak", "bestClean", "tradingDays"]);
    if (
      !group ||
      !count(group.cleanStreak) ||
      !count(group.bestClean) ||
      !count(group.tradingDays)
    ) {
      return null;
    }
    out.habits = {
      cleanStreak: group.cleanStreak,
      bestClean: group.bestClean,
      tradingDays: group.tradingDays,
    };
  }
  if (card.payouts !== undefined) {
    const group = only(card.payouts, ["count", "total"]);
    if (!group || !count(group.count) || !money(group.total)) return null;
    out.payouts = { count: group.count, total: group.total };
  }
  if (card.money !== undefined) {
    const group = only(card.money, ["firmFees", "totalCost", "netReturn"]);
    if (!group || !money(group.firmFees) || !money(group.totalCost) || !money(group.netReturn)) {
      return null;
    }
    out.money = {
      firmFees: group.firmFees,
      totalCost: group.totalCost,
      netReturn: group.netReturn,
    };
  }
  return out;
}
