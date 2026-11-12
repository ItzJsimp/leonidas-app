import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { readTradingRiskRules } from "./tradingRiskRules.ts";

// A made-up pack. The real pack and its numbers stay in the private pack repo.
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
          profitTarget: 1300,
          maxLoss: 500,
          dailyLoss: 600,
          consistencyPercent: null,
          winningDayRule: null,
          prices: { monthly: 10, activation: null, reset: null, oneTime: null },
          sourceFile: "firms/firm-a.md",
          fetchDate: "2026-01-01",
        },
      ],
    },
  ],
  setups: [],
  riskStates: [
    {
      id: "evaluation",
      name: "Evaluation",
      market: "NQ",
      contracts: 2,
      stopPoints: 12,
      targetPoints: 20,
      stopDollars: 480,
      targetDollars: 800,
      source: "knowledge/risk.md",
    },
  ],
  firstDay: { floor: 600, cap: 3300, defaultPassRate: 0.07 },
  sessions: { timeZone: "America/New_York", list: [] },
  library: {},
};

const setup = (options: { readonly pack?: unknown; readonly linked?: boolean } = {}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "leonidas-risk-rules-" });
    const packFolder = yield* fs.makeTempDirectoryScoped({ prefix: "leonidas-risk-pack-" });
    const workspace = {
      id: "trading-test",
      name: "Trading test",
      type: "trading",
      schemaVersion: 1,
      ...(options.linked === false ? {} : { crewPack: packFolder }),
    };
    yield* fs.writeFileString(path.join(root, "workspace.json"), JSON.stringify(workspace));
    yield* fs.writeFileString(
      path.join(packFolder, "trading-pack.json"),
      JSON.stringify(options.pack ?? PACK),
    );
    return { root };
  });

it.layer(NodeServices.layer)("trading risk rules", (it) => {
  it.effect("gives the risk states, the first day rule and the firm limits", () =>
    Effect.gen(function* () {
      const { root } = yield* setup();
      const result = yield* readTradingRiskRules(root);
      assert.strictEqual(result.status, "ready");
      if (result.status !== "ready") return;
      assert.strictEqual(result.riskStates.length, 1);
      assert.strictEqual(result.riskStates[0]?.stopPoints, 12);
      assert.deepStrictEqual(result.firstDay, PACK.firstDay);
      assert.deepStrictEqual(result.limits["Firm A/Plan 1"], { dailyLoss: 600, maxLoss: 500 });
    }).pipe(Effect.scoped),
  );

  it.effect("never sends a pack path or a source file to the client", () =>
    Effect.gen(function* () {
      const { root } = yield* setup();
      const text = JSON.stringify(yield* readTradingRiskRules(root));
      assert.notInclude(text, "leonidas-risk-pack-");
      assert.notInclude(text, "knowledge/risk.md");
      assert.notInclude(text, "source");
    }).pipe(Effect.scoped),
  );

  it.effect("reads as none when no pack is linked or the pack is invalid", () =>
    Effect.gen(function* () {
      const unlinked = yield* setup({ linked: false });
      assert.deepStrictEqual(yield* readTradingRiskRules(unlinked.root), { status: "none" });
      const invalid = yield* setup({ pack: { ...PACK, version: 2 } });
      assert.deepStrictEqual(yield* readTradingRiskRules(invalid.root), { status: "none" });
    }).pipe(Effect.scoped),
  );
});
