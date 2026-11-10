// @effect-diagnostics nodeBuiltinImport:off - the fake watcher stands in for a Node file watcher.
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { TOPSTEPX_HEADER } from "@t3tools/trading";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import type * as NodeFS from "node:fs";
import * as NodeEvents from "node:events";

import { writeWorkspaceFile } from "../taskBoard/aiosWorkspaces.ts";
import { readTradingState } from "./readTradingState.ts";
import {
  importTradingExport,
  listTradingImports,
  makeTradingImportWatch,
} from "./tradingImports.ts";

// Made-up firm and trades. Real exports stay on the trader's PC.
const line = (value: object) => `${JSON.stringify(value)}\n`;
const LEDGER =
  line({
    id: "acct-1",
    at: "2026-03-01T12:00:00-07:00",
    author: "Test",
    kind: "account.opened",
    firm: "Firm A",
    product: "Plan 1",
    size: "50K",
    platform: "Platform",
    last4: "0001",
    stage: "evaluation",
  }) +
  line({
    id: "acct-2",
    at: "2026-03-01T12:00:00-07:00",
    author: "Test",
    kind: "account.opened",
    firm: "Firm A",
    product: "Plan 1",
    size: "50K",
    platform: "Platform",
    last4: "0002",
    stage: "evaluation",
  }) +
  line({
    id: "close-2",
    at: "2026-03-02T12:00:00-07:00",
    author: "Test",
    kind: "account.closed",
    accountId: "acct-2",
    reason: "manual",
  });
const row = (id: number) =>
  `${id},MNQZ6,11/04/2026 10:30:10 -05:00,11/04/2026 10:31:30 -05:00,100,102,1.5,10,2,Long,11/04/2026 00:00:00 -06:00,00:01:20,0.5\r\n`;
const EXPORT = `﻿${TOPSTEPX_HEADER}\r\n${row(1)}${row(2)}`;

const fakeWatch = () => {
  const listeners: (() => void)[] = [];
  const watch = (_dir: string, onChange: () => void) => {
    listeners.push(onChange);
    return Object.assign(new NodeEvents.EventEmitter(), {
      close: () => undefined,
    }) as unknown as NodeFS.FSWatcher;
  };
  return { watch, fire: () => listeners.forEach((listener) => listener()) };
};

const setup = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "leonidas-trading-import-" });
  const downloads = yield* fs.makeTempDirectoryScoped({ prefix: "leonidas-downloads-" });
  writeWorkspaceFile(root, { id: "trading-test", name: "Trading test", type: "trading" });
  yield* fs.makeDirectory(path.join(root, "trading"));
  yield* fs.writeFileString(path.join(root, "trading", "ledger.jsonl"), LEDGER);
  const fake = fakeWatch();
  const watch = makeTradingImportWatch({ folder: downloads, watch: fake.watch, rescanMs: 1e9 });
  return { fs, path, root, downloads, watch, fire: fake.fire };
});

it.layer(NodeServices.layer)("trading imports", (it) => {
  it.effect("lists a TopstepX export and never copies another CSV", () =>
    Effect.gen(function* () {
      const { fs, path, root, downloads, watch } = yield* setup;
      yield* fs.writeFileString(path.join(downloads, "budget.csv"), "Date,Amount\n2026-11-04,5\n");
      yield* fs.writeFileString(path.join(downloads, "trades.csv"), EXPORT);
      const listed = yield* listTradingImports(root, watch);
      assert.deepStrictEqual(listed.files, [
        { name: "trades.csv", trades: 2, firstDay: "2026-11-04", lastDay: "2026-11-04" },
      ]);
      const notExport = yield* Effect.exit(
        importTradingExport(root, { file: "budget.csv", accountId: "acct-1" }, watch),
      );
      assert.isTrue(Exit.isFailure(notExport));
      assert.isFalse(yield* fs.exists(path.join(root, "trading", "imports")));
      assert.isTrue(yield* fs.exists(path.join(downloads, "budget.csv")));
    }).pipe(Effect.scoped),
  );

  it.effect("imports into the picked account, keeps a raw copy and adds 0 the second time", () =>
    Effect.gen(function* () {
      const { fs, path, root, downloads, watch } = yield* setup;
      yield* fs.writeFileString(path.join(downloads, "trades.csv"), EXPORT);
      const first = yield* importTradingExport(
        root,
        { file: "trades.csv", accountId: "acct-1" },
        watch,
      );
      assert.deepStrictEqual(first, { added: 2, duplicates: 0, skippedRows: 0 });
      const copy = yield* fs.readFile(
        path.join(root, "trading", "imports", "2026-11-04", "trades.csv"),
      );
      // Byte for byte, with the byte order mark.
      assert.deepStrictEqual(
        [...copy],
        [...(yield* fs.readFile(path.join(downloads, "trades.csv")))],
      );
      assert.deepStrictEqual(Array.from(copy.subarray(0, 3)), [0xef, 0xbb, 0xbf]);
      assert.isTrue(yield* fs.exists(path.join(downloads, "trades.csv")));
      const state = yield* readTradingState(root);
      assert.deepStrictEqual(
        state.trades.map((trade) => [trade.id, trade.accountId, trade.pnl]),
        [
          ["topstepx:1", "acct-1", 8],
          ["topstepx:2", "acct-1", 8],
        ],
      );

      const again = yield* importTradingExport(
        root,
        { file: "trades.csv", accountId: "acct-1" },
        watch,
      );
      assert.deepStrictEqual(again, { added: 0, duplicates: 2, skippedRows: 0 });
      assert.strictEqual((yield* readTradingState(root)).trades.length, 2);
      assert.deepStrictEqual((yield* listTradingImports(root, watch)).files, []);
    }).pipe(Effect.scoped),
  );

  it.effect("rejects a folder path, a closed account and an unknown account", () =>
    Effect.gen(function* () {
      const { fs, path, root, downloads, watch } = yield* setup;
      yield* fs.writeFileString(path.join(downloads, "trades.csv"), EXPORT);
      const reasons = [];
      for (const input of [
        { file: "../trades.csv", accountId: "acct-1" },
        { file: "trades.csv", accountId: "acct-2" },
        { file: "trades.csv", accountId: "nope" },
      ]) {
        const exit = yield* Effect.exit(importTradingExport(root, input, watch));
        reasons.push(Exit.isFailure(exit) ? String(exit.cause) : "imported");
      }
      assert.match(reasons[0] ?? "", /file_not_found/);
      assert.match(reasons[1] ?? "", /unknown_account/);
      assert.match(reasons[2] ?? "", /unknown_account/);
      assert.strictEqual((yield* readTradingState(root)).trades.length, 0);
    }).pipe(Effect.scoped),
  );

  it.effect("a watch event shows a new export with no wait for the rescan", () =>
    Effect.gen(function* () {
      const { fs, path, root, downloads, watch, fire } = yield* setup;
      assert.deepStrictEqual((yield* listTradingImports(root, watch)).files, []);
      yield* fs.writeFileString(path.join(downloads, "trades.csv"), EXPORT);
      // No watch event yet: the last scan stands.
      assert.deepStrictEqual((yield* listTradingImports(root, watch)).files, []);
      fire();
      const started = performance.now();
      const listed = yield* listTradingImports(root, watch);
      assert.strictEqual(listed.files[0]?.trades, 2);
      assert.isBelow(performance.now() - started, 1_000);
    }).pipe(Effect.scoped),
  );
});
