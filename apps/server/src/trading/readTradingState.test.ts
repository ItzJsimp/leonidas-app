import { TradingStateError, TradingStateResult } from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { writeWorkspaceFile, type AiosWorkspaceType } from "../taskBoard/aiosWorkspaces.ts";
import { readTradingState } from "./readTradingState.ts";

// Made-up firm and amounts. Real firm prices stay in the private pack.
const decodeResult = Schema.decodeUnknownEffect(TradingStateResult);
const line = (value: object) => `${JSON.stringify(value)}\n`;
const stamp = (day: number) => `2026-03-${String(day).padStart(2, "0")}T12:00:00-07:00`;
const LEDGER =
  line({
    id: "e1",
    at: stamp(1),
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
    id: "e2",
    at: stamp(1),
    author: "Test",
    kind: "attempt.started",
    accountId: "e1",
    via: "purchase",
    fee: 100,
  }) +
  line({
    id: "e3",
    at: stamp(9),
    author: "Test",
    kind: "attempt.ended",
    accountId: "e1",
    result: "passed",
  }) +
  "{ this line is torn\n";

const withWorkspace = <A, E>(
  type: AiosWorkspaceType,
  body: (root: string) => Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "leonidas-trading-state-" });
    writeWorkspaceFile(root, { id: "trading-test", name: "Trading test", type });
    return yield* body(root);
  }).pipe(Effect.scoped);

it.layer(NodeServices.layer)("readTradingState", (it) => {
  it.effect("derives the state, skips a torn line and matches the RPC schema", () =>
    withWorkspace("trading", (root) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        yield* fs.makeDirectory(path.join(root, "trading"), { recursive: true });
        yield* fs.writeFileString(path.join(root, "trading", "ledger.jsonl"), LEDGER);
        const result = yield* readTradingState(root);
        assert.strictEqual(result.skippedLines, 1);
        assert.strictEqual(result.state.accounts.length, 1);
        assert.deepEqual(result.state.passRate, { passed: 1, finished: 1, rate: 1 });
        assert.strictEqual(result.state.firmFees, 100);
        // The wire schema must accept exactly what the server returns.
        yield* decodeResult(JSON.parse(JSON.stringify(result)));
      }),
    ),
  );

  it.effect("reads a 5,000-event ledger in under 250 ms", () =>
    withWorkspace("trading", (root) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const rows = Array.from({ length: 5000 }, (_, index) =>
          line({
            id: `c${index}`,
            at: stamp(1 + (index % 27)),
            author: "Test",
            kind: "cost.paid",
            category: "data",
            amount: 1,
          }),
        );
        yield* fs.makeDirectory(path.join(root, "trading"), { recursive: true });
        yield* fs.writeFileString(path.join(root, "trading", "ledger.jsonl"), rows.join(""));
        const started = performance.now();
        const result = yield* readTradingState(root);
        const elapsed = performance.now() - started;
        assert.strictEqual(result.state.totalCost, 5000);
        assert.isBelow(elapsed, 250);
      }),
    ),
  );

  it.effect("treats missing files as an empty ledger", () =>
    withWorkspace("trading", (root) =>
      Effect.gen(function* () {
        const result = yield* readTradingState(root);
        assert.strictEqual(result.skippedLines, 0);
        assert.deepEqual(result.state.accounts, []);
        assert.strictEqual(result.state.netReturn, 0);
      }),
    ),
  );

  it.effect("refuses a workspace that is not a Trading workspace", () =>
    withWorkspace("personal", (root) =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(readTradingState(root));
        assert.instanceOf(error, TradingStateError);
        assert.strictEqual(error.reason, "not_a_trading_workspace");
      }),
    ),
  );

  it.effect("reports an unknown workspace", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(readTradingState(null));
      assert.strictEqual(error.reason, "workspace_not_found");
    }),
  );
});
