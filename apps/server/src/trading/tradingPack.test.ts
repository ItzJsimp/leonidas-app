// @effect-diagnostics nodeBuiltinImport:off - the fake watcher stands in for a Node file watcher.
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { TOPSTEPX_HEADER } from "@t3tools/trading";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeEvents from "node:events";
import type * as NodeFS from "node:fs";

import { readTradingState } from "./readTradingState.ts";
import { runRuleCheck } from "./runRuleCheck.ts";
import { importTradingExport, makeTradingImportWatch } from "./tradingImports.ts";
import { savePackConsent } from "./tradingPack.ts";

// A made-up pack and check modules. The real pack and its rule check stay in the private pack repo.
const PACK = {
  version: 1,
  firms: [
    {
      id: "firm-a",
      name: "Firm A",
      products: [
        {
          id: "plan-1",
          name: "Plan 1",
          size: 50000,
          profitTarget: 1000,
          maxLoss: 500,
          dailyLoss: null,
          consistencyPercent: null,
          winningDayRule: null,
          prices: { monthly: 10, activation: 20, reset: 10, oneTime: null },
          sourceFile: "firms/firm-a.md",
          fetchDate: "2026-01-01",
        },
      ],
    },
  ],
  setups: [],
  riskStates: [],
  sessions: { timeZone: "America/New_York", list: [] },
  library: {},
  checkModule: "checks/check.mjs",
};
const READ_IDS = `export const loadTrades = (files) => files.flatMap((file) =>
  file.text.split(/\\r?\\n/).slice(1).filter(Boolean).map((line) => ({ id: line.split(",")[0], tIn: 0 })));`;
const WAITS = `${READ_IDS}
export const reviewDay = (trades, bars) => bars.length
  ? { status: "ok", rows: trades.map((t) => ({ id: t.id, setup: "Setup 1", breaks: [] })) }
  : { status: "waiting", rows: [] };`;
const GRADES = `${READ_IDS}
export const reviewDay = (trades) => ({ status: "ok", rows: trades.map((t) => ({
  id: t.id, setup: "Setup 1", breaks: t.id === "2" ? ["after a loss"] : [] })) });`;
const line = (value: object) => `${JSON.stringify(value)}\n`;
const ACCOUNT = line({
  id: "acct-1",
  at: "2026-03-01T12:00:00-07:00",
  author: "Test",
  kind: "account.opened",
  firm: "Firm A",
  product: "Plan 1",
  size: "50K",
  platform: "TopstepX",
  last4: "0001",
  stage: "evaluation",
});
const row = (id: number) =>
  `${id},MNQZ6,11/04/2026 10:30:10 -05:00,11/04/2026 10:31:30 -05:00,100,102,1.5,10,2,Long,11/04/2026 00:00:00 -06:00,00:01:20,0.5\r\n`;
const EXPORT = `﻿${TOPSTEPX_HEADER}\r\n${row(1)}${row(2)}`;

const fakeWatch = (_dir: string, _onChange: () => void) =>
  Object.assign(new NodeEvents.EventEmitter(), {
    close: () => undefined,
  }) as unknown as NodeFS.FSWatcher;

const setup = (options: { readonly module?: string; readonly pack?: unknown } = {}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "leonidas-trading-pack-" });
    const packFolder = yield* fs.makeTempDirectoryScoped({ prefix: "leonidas-pack-" });
    const downloads = yield* fs.makeTempDirectoryScoped({ prefix: "leonidas-downloads-" });
    yield* fs.writeFileString(
      path.join(root, "workspace.json"),
      JSON.stringify({
        id: "trading-test",
        name: "Trading test",
        type: "trading",
        schemaVersion: 1,
        crewPack: packFolder,
      }),
    );
    yield* fs.makeDirectory(path.join(root, "trading"));
    yield* fs.writeFileString(path.join(root, "trading", "ledger.jsonl"), ACCOUNT);
    yield* fs.makeDirectory(path.join(packFolder, "checks"));
    yield* fs.writeFileString(
      path.join(packFolder, "trading-pack.json"),
      JSON.stringify(options.pack ?? PACK),
    );
    yield* fs.writeFileString(
      path.join(packFolder, "checks", "check.mjs"),
      options.module ?? WAITS,
    );
    yield* fs.writeFileString(path.join(downloads, "trades.csv"), EXPORT);
    const watch = makeTradingImportWatch({ folder: downloads, watch: fakeWatch, rescanMs: 1e9 });
    const importIt = () =>
      importTradingExport(root, { file: "trades.csv", accountId: "acct-1" }, watch);
    const state = () => readTradingState(root);
    const allow = (allow: boolean) =>
      Effect.gen(function* () {
        const { pack } = yield* state();
        assert.strictEqual(pack.status, "ready");
        const sha256 = pack.status === "ready" ? pack.check.sha256 : null;
        yield* savePackConsent(root, { allow, sha256: sha256 ?? "" });
      });
    return { fs, path, root, packFolder, importIt, state, allow };
  });

it.layer(NodeServices.layer)("linked trading pack", (it) => {
  it.effect("asks first: a pending check does not run, and the import still works", () =>
    Effect.gen(function* () {
      const { importIt, state } = yield* setup({ module: GRADES });
      const { pack } = yield* state();
      assert.strictEqual(pack.status === "ready" && pack.check.status, "pending");
      assert.match((pack.status === "ready" && pack.check.sha256) || "", /^[0-9a-f]{64}$/);
      assert.deepStrictEqual(pack.status === "ready" && pack.firms[0]?.products[0]?.prices, {
        monthly: 10,
        activation: 20,
        reset: 10,
        oneTime: null,
      });
      assert.strictEqual((yield* importIt()).check, "pending");
      const { trades } = yield* state();
      assert.strictEqual(trades.length, 2);
      assert.isTrue(
        trades.every((trade) => trade.check === undefined && trade.setup === undefined),
      );
    }).pipe(Effect.scoped),
  );

  it.effect("a decline keeps imports working with no grades", () =>
    Effect.gen(function* () {
      const { importIt, state, allow } = yield* setup({ module: GRADES });
      yield* allow(false);
      const { pack } = yield* state();
      assert.strictEqual(pack.status === "ready" && pack.check.status, "declined");
      assert.strictEqual((yield* importIt()).check, "declined");
      assert.isTrue((yield* state()).trades.every((trade) => trade.setup === undefined));
    }).pipe(Effect.scoped),
  );

  it.effect("with no market bars, trades import and wait for the rule check", () =>
    Effect.gen(function* () {
      const { importIt, state, allow } = yield* setup();
      yield* allow(true);
      assert.strictEqual((yield* importIt()).check, "waiting");
      const { trades } = yield* state();
      assert.deepStrictEqual(
        trades.map((trade) => trade.check),
        ["waiting", "waiting"],
      );
    }).pipe(Effect.scoped),
  );

  it.effect("an allowed check grades each new trade", () =>
    Effect.gen(function* () {
      const { importIt, state, allow } = yield* setup({ module: GRADES });
      yield* allow(true);
      assert.strictEqual((yield* importIt()).check, "graded");
      const byId = new Map((yield* state()).trades.map((trade) => [trade.id, trade]));
      assert.deepStrictEqual(byId.get("topstepx:2")?.ruleBreaks, ["after a loss"]);
      assert.strictEqual(byId.get("topstepx:1")?.setup, "Setup 1");
      assert.strictEqual(byId.get("topstepx:1")?.check, "graded");
    }).pipe(Effect.scoped),
  );

  it.effect("a changed module asks again, and a consent for an old hash is refused", () =>
    Effect.gen(function* () {
      const { fs, path, root, packFolder, state, allow } = yield* setup();
      yield* allow(true);
      const before = (yield* state()).pack;
      yield* fs.writeFileString(path.join(packFolder, "checks", "check.mjs"), `${WAITS}\n// new`);
      const after = (yield* state()).pack;
      assert.strictEqual(after.status === "ready" && after.check.status, "pending");
      const oldHash = before.status === "ready" ? (before.check.sha256 ?? "") : "";
      const exit = yield* Effect.exit(savePackConsent(root, { allow: true, sha256: oldHash }));
      assert.isTrue(Exit.isFailure(exit));
      assert.match(String(Exit.isFailure(exit) && exit.cause), /pack_changed/);
    }).pipe(Effect.scoped),
  );

  it.effect("the check cannot write files, and a blocked check still imports the trades", () =>
    Effect.gen(function* () {
      const { fs, path, root, packFolder, importIt, state, allow } = yield* setup();
      const escaped = path.join(root, "escaped.txt");
      yield* fs.writeFileString(
        path.join(packFolder, "checks", "check.mjs"),
        `import { writeFileSync } from "node:fs";\n${WAITS}\nwriteFileSync(${JSON.stringify(escaped)}, "x");`,
      );
      yield* allow(true);
      assert.strictEqual((yield* importIt()).check, "failed");
      assert.isFalse(yield* fs.exists(escaped));
      assert.strictEqual((yield* state()).trades.length, 2);
    }).pipe(Effect.scoped),
  );

  it.effect("a check that never ends stops at the time limit", () =>
    Effect.gen(function* () {
      const { fs, path, packFolder } = yield* setup();
      const module = path.join(packFolder, "checks", "loop.mjs");
      yield* fs.writeFileString(
        module,
        `${READ_IDS}\nexport const reviewDay = () => { for (;;) {} };`,
      );
      const started = performance.now();
      const outcome = yield* Effect.promise(() =>
        runRuleCheck({
          folder: packFolder,
          module,
          files: [{ name: "evaluation-0001", text: EXPORT }],
          bars: [],
          timeoutMs: 500,
        }),
      );
      assert.deepStrictEqual(outcome, { status: "failed", reason: "the check took too long" });
      assert.isBelow(performance.now() - started, 5_000);
    }).pipe(Effect.scoped),
  );

  it.effect("a bad pack is reported, the tracker still works, and pack rules reach the state", () =>
    Effect.gen(function* () {
      const bad = yield* setup({ pack: { ...PACK, extra: true } });
      const { pack, state } = yield* bad.state();
      assert.strictEqual(pack.status, "invalid");
      assert.match(pack.status === "invalid" ? pack.reason : "", /extra: unknown key/);
      assert.strictEqual(state.accounts[0]?.profitTarget, null);
      assert.strictEqual((yield* bad.importIt()).check, "off");

      const good = yield* setup();
      assert.strictEqual((yield* good.state()).state.accounts[0]?.profitTarget, 1000);
    }).pipe(Effect.scoped),
  );
});
