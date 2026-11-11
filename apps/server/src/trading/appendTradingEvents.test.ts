import { TradingStateError, TradingStateResult } from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { writeWorkspaceFile, type AiosWorkspaceType } from "../taskBoard/aiosWorkspaces.ts";
import { appendTradingEvents } from "./appendTradingEvents.ts";
import { readTradingState } from "./readTradingState.ts";

// Made-up firm and amounts. Real firm prices stay in the private pack.
const decodeResult = Schema.decodeUnknownEffect(TradingStateResult);
const stamp = (day: number) => `2026-03-${String(day).padStart(2, "0")}T12:00:00-07:00`;
const opened = {
  id: "acc1",
  at: stamp(1),
  kind: "account.opened",
  firm: "Firm A",
  product: "Plan 1",
  size: "50K",
  platform: "Platform",
  last4: "0001",
  stage: "evaluation",
};
const purchase = {
  id: "att1",
  at: stamp(1),
  kind: "attempt.started",
  accountId: "acc1",
  via: "purchase",
  fee: 100,
};

const withWorkspace = <A, E>(
  type: AiosWorkspaceType,
  body: (root: string, ledger: string) => Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "leonidas-trading-append-" });
    writeWorkspaceFile(root, { id: "trading-test", name: "Trading test", type });
    return yield* body(root, path.join(root, "trading", "ledger.jsonl"));
  }).pipe(Effect.scoped);

const lines = (ledger: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const text = yield* fs.readFileString(ledger);
    return text.split("\n").filter((row) => row !== "");
  });

it.layer(NodeServices.layer)("appendTradingEvents", (it) => {
  it.effect("writes lines, sets the author and changes the state", () =>
    withWorkspace("trading", (root, ledger) =>
      Effect.gen(function* () {
        const result = yield* appendTradingEvents(root, [opened, purchase]);
        assert.strictEqual(result.appended, 2);
        const written = yield* lines(ledger);
        assert.strictEqual(written.length, 2);
        assert.strictEqual(JSON.parse(written[0] ?? "{}").author, "Trader");
        const state = yield* readTradingState(root);
        assert.strictEqual(state.state.accounts.length, 1);
        assert.strictEqual(state.state.firmFees, 100);
        assert.deepEqual(
          state.entries.map((entry) => entry.id),
          ["att1", "acc1"],
        );
        yield* decodeResult(JSON.parse(JSON.stringify(state)));
      }),
    ),
  );

  it.effect("writes nothing when one event is invalid", () =>
    withWorkspace("trading", (root, ledger) =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          appendTradingEvents(root, [opened, { ...purchase, fee: -5 }]),
        );
        assert.instanceOf(error, TradingStateError);
        assert.strictEqual(error.reason, "invalid_event");
        assert.strictEqual(error.detail, "bad value for fee");
        const fs = yield* FileSystem.FileSystem;
        assert.isFalse(yield* fs.exists(ledger));
      }),
    ),
  );

  it.effect("an edit and a delete append correction events and keep the earlier line", () =>
    withWorkspace("trading", (root, ledger) =>
      Effect.gen(function* () {
        yield* appendTradingEvents(root, [opened, purchase]);
        yield* appendTradingEvents(root, [
          {
            id: "fix1",
            at: stamp(2),
            kind: "entry.corrected",
            targetId: "att1",
            patch: { fee: 80 },
          },
        ]);
        assert.strictEqual((yield* readTradingState(root)).state.firmFees, 80);
        yield* appendTradingEvents(root, [
          { id: "del1", at: stamp(3), kind: "entry.deleted", targetId: "att1" },
        ]);
        const after = yield* readTradingState(root);
        assert.strictEqual(after.state.firmFees, 0);
        assert.deepEqual(
          after.entries.map((entry) => entry.id),
          ["acc1"],
        );
        const written = yield* lines(ledger);
        assert.strictEqual(written.length, 4);
        assert.strictEqual(JSON.parse(written[1] ?? "{}").fee, 100);
      }),
    ),
  );

  it.effect("refuses a workspace that is not a Trading workspace, and an unknown one", () =>
    withWorkspace("personal", (root) =>
      Effect.gen(function* () {
        const wrong = yield* Effect.flip(appendTradingEvents(root, [opened]));
        assert.strictEqual(wrong.reason, "not_a_trading_workspace");
        const unknown = yield* Effect.flip(appendTradingEvents(null, [opened]));
        assert.strictEqual(unknown.reason, "workspace_not_found");
      }),
    ),
  );
});
