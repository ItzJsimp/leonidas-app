import { TradingStateError } from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { writeWorkspaceFile, type AiosWorkspaceType } from "../taskBoard/aiosWorkspaces.ts";
import { appendTradingEvents } from "./appendTradingEvents.ts";
import { readTradingState } from "./readTradingState.ts";
import { addManualTrade } from "./tradingManualTrade.ts";

// Made-up firm and trade. Real trades stay on the trader's PC.
const stamp = "2026-03-01T12:00:00-05:00";
const opened = {
  id: "acc1",
  at: stamp,
  kind: "account.opened",
  firm: "Firm A",
  product: "Plan 1",
  size: "50K",
  platform: "Platform",
  last4: "0001",
  stage: "evaluation",
};
const TRADE = {
  accountId: "acc1",
  day: "2026-03-04",
  contract: "Contract 1",
  side: "short" as const,
  size: 2,
  points: -3,
  pnl: -60,
};

const withWorkspace = <A, E>(
  body: (root: string) => Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | Crypto.Crypto>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "leonidas-trading-manual-" });
    writeWorkspaceFile(root, {
      id: "trading-test",
      name: "Trading test",
      type: "trading" as AiosWorkspaceType,
    });
    return yield* body(root);
  }).pipe(Effect.scoped);

it.layer(NodeServices.layer)("manual trades", (it) => {
  it.effect("adds one trade with a manual id, and the state counts it", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        yield* appendTradingEvents(root, [opened]);
        const added = yield* addManualTrade(root, TRADE);
        assert.match(added.id, /^manual-/);
        const trade = (yield* readTradingState(root)).trades.find((item) => item.id === added.id);
        assert.deepInclude(trade ?? {}, {
          accountId: "acc1",
          day: "2026-03-04",
          at: "2026-03-04T00:00:00",
          pnl: -60,
          contract: "Contract 1",
          side: "short",
          size: 2,
          points: -3,
        });
      }),
    ),
  );

  it.effect("refuses an account that does not exist or is closed", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        const unknown = yield* Effect.flip(addManualTrade(root, TRADE));
        assert.strictEqual(unknown.reason, "unknown_account");
        yield* appendTradingEvents(root, [
          opened,
          {
            id: "close1",
            at: stamp,
            kind: "account.closed",
            accountId: "acc1",
            reason: "manual",
          },
        ]);
        const closed = yield* Effect.flip(addManualTrade(root, TRADE));
        assert.instanceOf(closed, TradingStateError);
        assert.strictEqual(closed.reason, "unknown_account");
      }),
    ),
  );

  it.effect("refuses a number that is not finite, and writes no line", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        yield* appendTradingEvents(root, [opened]);
        const error = yield* Effect.flip(addManualTrade(root, { ...TRADE, pnl: Number.NaN }));
        assert.strictEqual(error.reason, "invalid_trade");
        assert.strictEqual((yield* readTradingState(root)).trades.length, 0);
      }),
    ),
  );

  it.effect("refuses a day that is not YYYY-MM-DD", () =>
    withWorkspace((root) =>
      Effect.gen(function* () {
        yield* appendTradingEvents(root, [opened]);
        const error = yield* Effect.flip(addManualTrade(root, { ...TRADE, day: "03/04/2026" }));
        assert.strictEqual(error.reason, "invalid_day");
      }),
    ),
  );
});
