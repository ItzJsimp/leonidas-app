import { assert, describe, it } from "@effect/vitest";

import { parseTrades } from "./events.ts";
import {
  TOPSTEPX_HEADER,
  isTopstepxExport,
  parseTopstepxExport,
  unseenTrades,
} from "./topstepx.ts";

// Made-up trades. Real exports stay on the trader's PC.
const BOM = "﻿";
const row = (id: string, enteredAt: string, type: string, pnl: string) =>
  `${id},MNQZ6,${enteredAt},11/04/2026 10:31:30 -05:00,100.25,102.75,1.50,${pnl},2,${type},11/04/2026 00:00:00 -06:00,00:01:20.1234567,0.50\r\n`;
const EXPORT =
  `${BOM}${TOPSTEPX_HEADER}\r\n` +
  row("101", "11/04/2026 10:30:10 -05:00", "Long", "10.00") +
  row("102", "11/04/2026 10:40:00 -05:00", "Short", "-5.00");

describe("TopstepX Trades export", () => {
  it("knows the real header after a byte order mark", () => {
    assert.isTrue(isTopstepxExport(EXPORT));
    assert.isTrue(isTopstepxExport(`${TOPSTEPX_HEADER}\n`));
  });

  it("rejects a CSV with other columns", () => {
    assert.isFalse(isTopstepxExport(`${BOM}Id,ContractName,EnteredAt,PnL\r\n1,NQ,x,1\r\n`));
    assert.isFalse(isTopstepxExport(`${BOM}${TOPSTEPX_HEADER},Account\r\n`));
    assert.isFalse(isTopstepxExport(""));
    const parsed = parseTopstepxExport("Date,Amount\n2026-11-04,5\n", "acct-1");
    assert.deepStrictEqual(parsed.trades, []);
    assert.strictEqual(parsed.issues.length, 1);
  });

  it("maps each row to a trade on the picked account, net of fees and commissions", () => {
    const { trades, issues } = parseTopstepxExport(EXPORT, "acct-1");
    assert.deepStrictEqual(issues, []);
    assert.deepStrictEqual(trades[0], {
      id: "topstepx:101",
      accountId: "acct-1",
      day: "2026-11-04",
      at: "2026-11-04T10:30:10-05:00",
      pnl: 8,
      contract: "MNQZ6",
      side: "long",
      size: 2,
      points: 2.5,
    });
    assert.strictEqual(trades[1]?.pnl, -7);
    assert.strictEqual(trades[1]?.points, -2.5);
    // Each trade is a valid line of trades.jsonl.
    const lines = trades.map((trade) => JSON.stringify(trade)).join("\n");
    assert.strictEqual(parseTrades(lines).trades.length, 2);
  });

  it("uses the entry day when TradeDay is empty, and skips a bad row with a reason", () => {
    const text =
      `${TOPSTEPX_HEADER}\n` +
      "7,NQZ6,11/05/2026 09:45:00 -05:00,11/05/2026 09:46:00 -05:00,1,2,0,20,1,Long,,,\n" +
      "8,NQZ6,not a time,11/05/2026 09:46:00 -05:00,1,2,0,20,1,Long,,,\n";
    const { trades, issues } = parseTopstepxExport(text, "acct-1");
    assert.strictEqual(trades.length, 1);
    assert.strictEqual(trades[0]?.day, "2026-11-05");
    assert.deepStrictEqual(issues, [{ line: 3, reason: "bad EnteredAt" }]);
  });

  it("adds 0 trades when the same export is imported twice", () => {
    const first = parseTopstepxExport(EXPORT, "acct-1").trades;
    const added = unseenTrades(first, new Set());
    assert.strictEqual(added.length, 2);
    const again = unseenTrades(
      parseTopstepxExport(EXPORT, "acct-1").trades,
      new Set(added.map((trade) => trade.id)),
    );
    assert.strictEqual(again.length, 0);
  });

  it("counts a trade once when one export lists it twice", () => {
    const text = `${TOPSTEPX_HEADER}\n${row("5", "11/04/2026 10:30:10 -05:00", "Long", "1")}${row("5", "11/04/2026 10:30:10 -05:00", "Long", "1")}`;
    assert.strictEqual(unseenTrades(parseTopstepxExport(text, "a").trades, new Set()).length, 1);
  });
});
