import { parseTrade, type LineIssue, type Trade } from "./events.ts";

/** The first line of a TopstepX Trades export. The export has no account column. */
export const TOPSTEPX_HEADER =
  "Id,ContractName,EnteredAt,ExitedAt,EntryPrice,ExitPrice,Fees,PnL,Size,Type,TradeDay,TradeDuration,Commissions";
const COLUMNS = TOPSTEPX_HEADER.split(",");

const stripBom = (text: string): string => text.replace(/^﻿/, "");

/** True when the first line, after a byte order mark, is exactly the TopstepX Trades header. */
export function isTopstepxExport(text: string): boolean {
  const body = stripBom(text);
  const end = body.search(/\r?\n/);
  return (end === -1 ? body : body.slice(0, end)).trim() === TOPSTEPX_HEADER;
}

/** Rows of a CSV text with quoted cells. Blank rows are dropped; `line` is the 1-based text line. */
function csvRows(text: string): { readonly line: number; readonly cells: string[] }[] {
  const rows: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  const endRow = () => {
    cells.push(cell);
    if (cells.some((value) => value !== "")) rows.push({ line: rowLine, cells });
    cells = [];
    cell = "";
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      cells.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
      line++;
      rowLine = line;
    } else cell += c;
  }
  endRow();
  return rows;
}

const WHEN = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})(?:\.\d+)? ([+-]\d{2}):?(\d{2})$/;

/** "11/04/2026 10:30:10 -05:00" to "2026-11-04T10:30:10-05:00", the time as the export wrote it. */
function isoTime(value: string): string | null {
  const m = WHEN.exec(value.trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[1]}-${m[2]}T${m[4]}:${m[5]}:${m[6]}${m[7]}:${m[8]}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

const DAY = /^(\d{2})\/(\d{2})\/(\d{4})/;
const cents = (value: number): number => Math.round(value * 100) / 100;
const decimal = (value: string | undefined): number =>
  value === undefined || value.trim() === "" ? Number.NaN : Number(value);
const optionalDecimal = (value: string | undefined): number =>
  value === undefined || value.trim() === "" ? 0 : Number(value);

function toTrade(get: (column: string) => string | undefined, accountId: string): Trade | string {
  const id = get("Id")?.trim();
  if (!id) return "missing Id";
  const at = isoTime(get("EnteredAt") ?? "");
  if (!at) return "bad EnteredAt";
  const side = get("Type")?.trim().toLowerCase();
  if (side !== "long" && side !== "short") return "bad Type";
  const entry = decimal(get("EntryPrice"));
  const exit = decimal(get("ExitPrice"));
  const pnl = decimal(get("PnL"));
  const size = decimal(get("Size"));
  const fees = optionalDecimal(get("Fees"));
  const commissions = optionalDecimal(get("Commissions"));
  if (![entry, exit, pnl, size, fees, commissions].every(Number.isFinite)) return "bad number";
  const tradeDay = DAY.exec(get("TradeDay")?.trim() ?? "");
  const trade = {
    id: `topstepx:${id}`,
    accountId,
    day: tradeDay ? `${tradeDay[3]}-${tradeDay[1]}-${tradeDay[2]}` : at.slice(0, 10),
    at,
    // PnL in the export is before fees and commissions; the ledger keeps net dollars.
    pnl: cents(pnl - fees - commissions),
    contract: get("ContractName")?.trim() || "unknown",
    side,
    size,
    points: cents((exit - entry) * (side === "short" ? -1 : 1)),
  };
  return parseTrade(trade);
}

/**
 * Reads a TopstepX Trades export into trades for the account the trader picked. The dedupe key is
 * the platform plus the trade Id. A bad row is skipped and reported; a file with another header
 * gives no trades and one issue.
 */
export function parseTopstepxExport(
  text: string,
  accountId: string,
): { readonly trades: Trade[]; readonly issues: LineIssue[] } {
  const [header, ...rows] = csvRows(stripBom(text));
  if (!header || header.cells.map((cell) => cell.trim()).join(",") !== TOPSTEPX_HEADER) {
    return { trades: [], issues: [{ line: 1, reason: "not a TopstepX Trades export" }] };
  }
  const trades: Trade[] = [];
  const issues: LineIssue[] = [];
  for (const { line, cells } of rows) {
    const parsed = toTrade((column) => cells[COLUMNS.indexOf(column)], accountId);
    if (typeof parsed === "string") issues.push({ line, reason: parsed });
    else trades.push(parsed);
  }
  return { trades, issues };
}

/** Trades whose id is not in `seenIds`, each id once. */
export function unseenTrades(trades: readonly Trade[], seenIds: ReadonlySet<string>): Trade[] {
  const seen = new Set(seenIds);
  return trades.filter((trade) => !seen.has(trade.id) && Boolean(seen.add(trade.id)));
}
