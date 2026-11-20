// Strict reader for `trading-pack.json`, on the `parsePackJson` pattern of the mail-autopilot pack.
// A pack is untrusted input: unknown keys, `__proto__` and paths outside the pack folder fail.

export class TradingPackError extends Error {
  constructor(path: string, message: string) {
    super(`Invalid pack at ${path}: ${message}`);
    this.name = "TradingPackError";
  }
}

export interface PackPrices {
  readonly monthly: number | null;
  readonly activation: number | null;
  readonly reset: number | null;
  readonly oneTime: number | null;
}

export interface PackProduct {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly profitTarget: number | null;
  readonly maxLoss: number | null;
  readonly dailyLoss: number | null;
  readonly consistencyPercent: number | null;
  readonly winningDayRule: string | null;
  readonly prices: PackPrices;
  readonly sourceFile: string;
  readonly fetchDate: string;
}

export interface PackFirm {
  readonly id: string;
  readonly name: string;
  readonly products: readonly PackProduct[];
}

export interface PackSetup {
  readonly id: string;
  readonly name: string;
  readonly source: string;
}

export interface PackRiskState {
  readonly id: string;
  readonly name: string;
  readonly market: string;
  readonly contracts: number;
  readonly stopPoints: number;
  readonly targetPoints: number;
  readonly stopDollars: number;
  readonly targetDollars: number;
  readonly source: string;
}

/** The first funded day rule. The rule itself is set by the pack, not by the app. */
export interface PackFirstDay {
  readonly floor: number;
  readonly cap: number;
  readonly defaultPassRate: number;
}

export interface TradingPack {
  readonly version: 1;
  readonly firms: readonly PackFirm[];
  readonly setups: readonly PackSetup[];
  readonly riskStates: readonly PackRiskState[];
  readonly firstDay?: PackFirstDay;
  readonly sessions: {
    readonly timeZone: string;
    readonly list: readonly { readonly id: string; readonly name: string; readonly open: string }[];
  };
  readonly library: Readonly<Partial<Record<(typeof LIBRARY_KEYS)[number], string>>>;
  /** A path inside the pack folder. The app runs it only after the trader allows it. */
  readonly checkModule?: string;
}

type Obj = Record<string, unknown>;
const MAX_SHORT = 200;
const MAX_TEXT = 2_000;
const MAX_LIST = 500;
const MAX_MONEY = 1_000_000_000;
const MAX_PACK_FILE = 1_000_000;
const LIBRARY_KEYS = [
  "manifest",
  "knowledge",
  "drills",
  "community",
  "firms",
  "resources",
] as const;

function obj(v: unknown, path: string, allowed: readonly string[]): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    throw new TradingPackError(path, "needs an object");
  }
  for (const k of Object.keys(v)) {
    if (!allowed.includes(k)) throw new TradingPackError(`${path}.${k}`, "unknown key");
  }
  return v as Obj;
}

function str(v: unknown, path: string, max = MAX_SHORT): string {
  if (typeof v !== "string" || v.trim() === "" || v.length > max) {
    throw new TradingPackError(path, "needs a non-empty text");
  }
  return v;
}

function list(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v) || v.length > MAX_LIST) throw new TradingPackError(path, "needs a list");
  return v;
}

function num(v: unknown, path: string, min = 0, max = MAX_MONEY): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) {
    throw new TradingPackError(path, `needs a number from ${min} to ${max}`);
  }
  return v;
}

const orNull = <T>(v: unknown, read: () => T): T | null => (v === null ? null : read());

/** A relative path with forward slashes that stays inside the pack folder. */
function packPath(v: unknown, path: string): string {
  const text = str(v, path);
  if (
    text.includes("\\") ||
    text.includes("\0") ||
    text.startsWith("/") ||
    /^[a-z]:/i.test(text) ||
    text.split("/").some((part) => part === "..")
  ) {
    throw new TradingPackError(path, "needs a path inside the pack folder");
  }
  return text;
}

function uniqueIds<T extends { readonly id: string }>(items: readonly T[], path: string): T[] {
  const seen = new Set<string>();
  for (const [index, item] of items.entries()) {
    if (seen.has(item.id)) throw new TradingPackError(`${path}[${index}].id`, "repeated id");
    seen.add(item.id);
  }
  return [...items];
}

function parsePrices(v: unknown, path: string): PackPrices {
  const p = obj(v, path, ["monthly", "activation", "reset", "oneTime"]);
  const price = (key: keyof PackPrices) => orNull(p[key], () => num(p[key], `${path}.${key}`));
  return {
    monthly: price("monthly"),
    activation: price("activation"),
    reset: price("reset"),
    oneTime: price("oneTime"),
  };
}

function parseProduct(v: unknown, path: string): PackProduct {
  const p = obj(v, path, [
    "id",
    "name",
    "size",
    "profitTarget",
    "maxLoss",
    "dailyLoss",
    "consistencyPercent",
    "winningDayRule",
    "prices",
    "sourceFile",
    "fetchDate",
  ]);
  const fetchDate = str(p.fetchDate, `${path}.fetchDate`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fetchDate) || Number.isNaN(Date.parse(fetchDate))) {
    throw new TradingPackError(`${path}.fetchDate`, "needs a date like 2026-01-31");
  }
  return {
    id: str(p.id, `${path}.id`),
    name: str(p.name, `${path}.name`),
    size: num(p.size, `${path}.size`, 1),
    profitTarget: orNull(p.profitTarget, () => num(p.profitTarget, `${path}.profitTarget`)),
    maxLoss: orNull(p.maxLoss, () => num(p.maxLoss, `${path}.maxLoss`)),
    dailyLoss: orNull(p.dailyLoss, () => num(p.dailyLoss, `${path}.dailyLoss`)),
    consistencyPercent: orNull(p.consistencyPercent, () =>
      num(p.consistencyPercent, `${path}.consistencyPercent`, 0, 100),
    ),
    winningDayRule: orNull(p.winningDayRule, () =>
      str(p.winningDayRule, `${path}.winningDayRule`, MAX_TEXT),
    ),
    prices: parsePrices(p.prices, `${path}.prices`),
    sourceFile: packPath(p.sourceFile, `${path}.sourceFile`),
    fetchDate,
  };
}

function parseFirm(v: unknown, path: string): PackFirm {
  const f = obj(v, path, ["id", "name", "products"]);
  const products = list(f.products, `${path}.products`).map((item, index) =>
    parseProduct(item, `${path}.products[${index}]`),
  );
  return {
    id: str(f.id, `${path}.id`),
    name: str(f.name, `${path}.name`),
    products: uniqueIds(products, `${path}.products`),
  };
}

function parseRiskState(v: unknown, path: string): PackRiskState {
  const r = obj(v, path, [
    "id",
    "name",
    "market",
    "contracts",
    "stopPoints",
    "targetPoints",
    "stopDollars",
    "targetDollars",
    "source",
  ]);
  const contracts = num(r.contracts, `${path}.contracts`, 1, 1_000);
  if (!Number.isInteger(contracts))
    throw new TradingPackError(`${path}.contracts`, "needs a whole number");
  return {
    id: str(r.id, `${path}.id`),
    name: str(r.name, `${path}.name`),
    market: str(r.market, `${path}.market`),
    contracts,
    stopPoints: num(r.stopPoints, `${path}.stopPoints`),
    targetPoints: num(r.targetPoints, `${path}.targetPoints`),
    stopDollars: num(r.stopDollars, `${path}.stopDollars`),
    targetDollars: num(r.targetDollars, `${path}.targetDollars`),
    source: packPath(r.source, `${path}.source`),
  };
}

function parseFirstDay(v: unknown, path: string): PackFirstDay {
  const f = obj(v, path, ["floor", "cap", "defaultPassRate"]);
  const floor = num(f.floor, `${path}.floor`);
  const cap = num(f.cap, `${path}.cap`);
  if (cap < floor) throw new TradingPackError(`${path}.cap`, "needs a cap at or above floor");
  const defaultPassRate = num(f.defaultPassRate, `${path}.defaultPassRate`, 0, 1);
  if (defaultPassRate === 0) {
    throw new TradingPackError(`${path}.defaultPassRate`, "needs a rate above 0");
  }
  return { floor, cap, defaultPassRate };
}

/** Validates untrusted pack data. Throws `TradingPackError` naming the first bad path. */
export function parseTradingPack(input: unknown): TradingPack {
  const p = obj(input, "pack", [
    "version",
    "firms",
    "setups",
    "riskStates",
    "firstDay",
    "sessions",
    "library",
    "checkModule",
  ]);
  if (p.version !== 1) throw new TradingPackError("version", "needs 1");
  const firms = list(p.firms, "firms").map((item, index) => parseFirm(item, `firms[${index}]`));
  const setups = list(p.setups, "setups").map((item, index) => {
    const path = `setups[${index}]`;
    const s = obj(item, path, ["id", "name", "source"]);
    return {
      id: str(s.id, `${path}.id`),
      name: str(s.name, `${path}.name`),
      source: packPath(s.source, `${path}.source`),
    };
  });
  const riskStates = list(p.riskStates, "riskStates").map((item, index) =>
    parseRiskState(item, `riskStates[${index}]`),
  );
  const sessionsIn = obj(p.sessions, "sessions", ["timeZone", "list"]);
  const sessions = {
    timeZone: str(sessionsIn.timeZone, "sessions.timeZone"),
    list: uniqueIds(
      list(sessionsIn.list, "sessions.list").map((item, index) => {
        const path = `sessions.list[${index}]`;
        const s = obj(item, path, ["id", "name", "open"]);
        const open = str(s.open, `${path}.open`);
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(open)) {
          throw new TradingPackError(`${path}.open`, "needs a time like 09:30");
        }
        return { id: str(s.id, `${path}.id`), name: str(s.name, `${path}.name`), open };
      }),
      "sessions.list",
    ),
  };
  const libraryIn = obj(p.library, "library", LIBRARY_KEYS);
  const library: Partial<Record<(typeof LIBRARY_KEYS)[number], string>> = {};
  for (const key of LIBRARY_KEYS) {
    if (libraryIn[key] !== undefined) library[key] = packPath(libraryIn[key], `library.${key}`);
  }
  let checkModule: string | undefined;
  if (p.checkModule !== undefined) {
    checkModule = packPath(p.checkModule, "checkModule");
    if (!/\.m?js$/.test(checkModule)) {
      throw new TradingPackError("checkModule", "needs a .mjs or .js file");
    }
  }
  const firstDay = p.firstDay === undefined ? undefined : parseFirstDay(p.firstDay, "firstDay");
  return {
    version: 1,
    firms: uniqueIds(firms, "firms"),
    setups: uniqueIds(setups, "setups"),
    riskStates: uniqueIds(riskStates, "riskStates"),
    ...(firstDay === undefined ? {} : { firstDay }),
    sessions,
    library,
    ...(checkModule === undefined ? {} : { checkModule }),
  };
}

/** Parses the text of `trading-pack.json`. The caller reads the file; this module does no I/O. */
export function parseTradingPackJson(text: string): TradingPack {
  if (text.length > MAX_PACK_FILE) throw new TradingPackError("file", "too large (over 1 MB)");
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    throw new TradingPackError("file", "not valid JSON");
  }
  return parseTradingPack(data);
}
