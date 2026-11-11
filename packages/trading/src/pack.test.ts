import { assert, describe, it } from "@effect/vitest";

import { parseTradingPackJson } from "./pack.ts";

// A made-up pack. The real pack, its firms, prices and rules stay in the private pack repo.
const product = {
  id: "plan-1",
  name: "Plan 1",
  size: 50000,
  profitTarget: 1000,
  maxLoss: 500,
  dailyLoss: null,
  consistencyPercent: 50,
  winningDayRule: null,
  prices: { monthly: 10, activation: 20, reset: 10, oneTime: null },
  sourceFile: "firms/firm-a.md",
  fetchDate: "2026-01-01",
};
const PACK = {
  version: 1,
  firms: [{ id: "firm-a", name: "Firm A", products: [product] }],
  setups: [{ id: "setup-1", name: "Setup 1", source: "knowledge/setups.md" }],
  riskStates: [
    {
      id: "state-1",
      name: "State 1",
      market: "NQ",
      contracts: 1,
      stopPoints: 5,
      targetPoints: 5,
      stopDollars: 100,
      targetDollars: 100,
      source: "knowledge/risk.md",
    },
  ],
  sessions: { timeZone: "America/New_York", list: [{ id: "open", name: "Open", open: "09:30" }] },
  library: { manifest: "course/manifest.csv", knowledge: "knowledge/" },
  checkModule: "checks/check.mjs",
};
const text = (value: unknown) => JSON.stringify(value);
const withKey = (key: string, value: unknown) => text({ ...PACK, [key]: value });

describe("trading pack", () => {
  it("reads a valid pack, with or without a byte order mark", () => {
    const pack = parseTradingPackJson(text(PACK));
    assert.strictEqual(pack.firms[0]?.products[0]?.prices.reset, 10);
    assert.strictEqual(pack.checkModule, "checks/check.mjs");
    assert.deepStrictEqual(parseTradingPackJson(`\uFEFF${text(PACK)}`), pack);
    const { checkModule: _, ...noCheck } = PACK;
    assert.isUndefined(parseTradingPackJson(text(noCheck)).checkModule);
  });

  it("rejects a file over 1 MB and text that is not JSON", () => {
    assert.throws(() => parseTradingPackJson(" ".repeat(1_100_000)), /too large/);
    assert.throws(() => parseTradingPackJson("{ nope"), /not valid JSON/);
  });

  it("rejects an unknown key at any level", () => {
    assert.throws(() => parseTradingPackJson(withKey("extra", 1)), /extra: unknown key/);
    const firms = [{ ...PACK.firms[0], products: [{ ...product, discount: 5 }] }];
    assert.throws(() => parseTradingPackJson(withKey("firms", firms)), /discount: unknown key/);
  });

  it("does not let a __proto__ key through", () => {
    const top = text(PACK).replace("{", '{"__proto__":{"x":1},');
    assert.throws(() => parseTradingPackJson(top), /__proto__/);
    const nested = text(PACK).replace('"prices":{', '"prices":{"__proto__":{"x":1},');
    assert.throws(() => parseTradingPackJson(nested), /__proto__/);
  });

  it("rejects a path that leaves the pack folder", () => {
    for (const path of ["../outside.mjs", "/abs/check.mjs", "C:/check.mjs", "checks\\..\\x.mjs"]) {
      assert.throws(() => parseTradingPackJson(withKey("checkModule", path)), /checkModule/);
    }
    assert.throws(() => parseTradingPackJson(withKey("checkModule", "checks/check.sh")), /\.mjs/);
  });

  it("rejects bad numbers, a wrong version and a repeated id", () => {
    const firms = (patch: object) => [{ ...PACK.firms[0], products: [{ ...product, ...patch }] }];
    assert.throws(() => parseTradingPackJson(withKey("firms", firms({ size: -1 }))), /size/);
    assert.throws(
      () => parseTradingPackJson(withKey("firms", firms({ fetchDate: "soon" }))),
      /fetchDate/,
    );
    assert.throws(() => parseTradingPackJson(withKey("version", 2)), /version/);
    const twice = [PACK.firms[0], PACK.firms[0]];
    assert.throws(() => parseTradingPackJson(withKey("firms", twice)), /repeated id/);
  });
});
