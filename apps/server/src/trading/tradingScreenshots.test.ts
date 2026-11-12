import { TradingStateError } from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import { appendTrades } from "@t3tools/trading/ledgerFile";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { writeWorkspaceFile, type AiosWorkspaceType } from "../taskBoard/aiosWorkspaces.ts";
import { readTradingState } from "./readTradingState.ts";
import { readScreenshot, saveScreenshot } from "./tradingScreenshots.ts";

const DAY = "2026-03-04";
const HEX = "0123456789abcdef0123456789abcdef";
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// A made-up picture: the real header and an invented body.
const PNG = Buffer.from([...PNG_HEADER, ...Buffer.from("made-up body")]).toString("base64");
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]).toString("base64");
const TRADE = {
  id: "topstepx:1",
  accountId: "acc1",
  day: DAY,
  at: "2026-03-04T10:00:00-05:00",
  pnl: 12.5,
};

const withWorkspace = <A, E>(
  type: AiosWorkspaceType,
  body: (root: string) => Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | Crypto.Crypto>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "leonidas-trading-shots-" });
    writeWorkspaceFile(root, { id: "trading-test", name: "Trading test", type });
    return yield* body(root);
  }).pipe(Effect.scoped);

const seedTrade = (root: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    yield* appendTrades(path.join(root, "trading", "trades.jsonl"), [TRADE]);
  });

const shotFolder = (root: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    return path.join(root, "trading", "screenshots", DAY);
  });

it.layer(NodeServices.layer)("trading screenshots", (it) => {
  it.effect("saves a pasted image under a generated name and reads it back", () =>
    withWorkspace("trading", (root) =>
      Effect.gen(function* () {
        const saved = yield* saveScreenshot(root, { day: DAY, mime: "image/png", dataBase64: PNG });
        assert.match(saved.name, /^[0-9a-f]{32}\.png$/);
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const file = path.join(yield* shotFolder(root), saved.name);
        assert.deepEqual(yield* fs.readFile(file), Buffer.from(PNG, "base64"));
        const read = yield* readScreenshot(root, { day: DAY, name: saved.name });
        assert.strictEqual(read.mime, "image/png");
        assert.strictEqual(read.dataBase64, PNG);
      }),
    ),
  );

  it.effect("tags the trade with the screenshot path, so the Journal shows a thumbnail", () =>
    withWorkspace("trading", (root) =>
      Effect.gen(function* () {
        yield* seedTrade(root);
        const saved = yield* saveScreenshot(root, {
          day: DAY,
          tradeId: TRADE.id,
          mime: "image/png",
          dataBase64: PNG,
        });
        const state = yield* readTradingState(root);
        const trade = state.trades.find((item) => item.id === TRADE.id);
        assert.strictEqual(trade?.screenshot, `screenshots/${DAY}/${saved.name}`);
      }),
    ),
  );

  it.effect("rejects an image whose bytes do not match its type", () =>
    withWorkspace("trading", (root) =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          saveScreenshot(root, { day: DAY, mime: "image/jpeg", dataBase64: PNG }),
        );
        assert.instanceOf(error, TradingStateError);
        assert.strictEqual(error.reason, "image_mismatch");
        const ok = yield* saveScreenshot(root, {
          day: DAY,
          mime: "image/jpeg",
          dataBase64: JPEG_BYTES,
        });
        assert.match(ok.name, /\.jpg$/);
      }),
    ),
  );

  it.effect("rejects an image over 5 MB and writes nothing", () =>
    withWorkspace("trading", (root) =>
      Effect.gen(function* () {
        const big = Buffer.alloc(5 * 1024 * 1024 + 1);
        big.set(PNG_HEADER, 0);
        const error = yield* Effect.flip(
          saveScreenshot(root, { day: DAY, mime: "image/png", dataBase64: big.toString("base64") }),
        );
        assert.strictEqual(error.reason, "image_too_large");
        const fs = yield* FileSystem.FileSystem;
        assert.isFalse(yield* fs.exists(yield* shotFolder(root)));
      }),
    ),
  );

  it.effect("rejects a trade that is not in the trades file, and writes nothing", () =>
    withWorkspace("trading", (root) =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          saveScreenshot(root, {
            day: DAY,
            tradeId: "topstepx:missing",
            mime: "image/png",
            dataBase64: PNG,
          }),
        );
        assert.strictEqual(error.reason, "unknown_trade");
        const fs = yield* FileSystem.FileSystem;
        assert.isFalse(yield* fs.exists(yield* shotFolder(root)));
      }),
    ),
  );

  it.effect("rejects a bad day, a type outside the three, and a bad name on read", () =>
    withWorkspace("trading", (root) =>
      Effect.gen(function* () {
        const badDay = yield* Effect.flip(
          saveScreenshot(root, { day: "2026-3-4", mime: "image/png", dataBase64: PNG }),
        );
        assert.strictEqual(badDay.reason, "invalid_day");
        const gif = yield* Effect.flip(
          saveScreenshot(root, {
            day: DAY,
            mime: "image/gif" as "image/png",
            dataBase64: PNG,
          }),
        );
        assert.strictEqual(gif.reason, "unsupported_image");
        for (const name of ["../secret.png", "abc.png", `${HEX}.gif`]) {
          const error = yield* Effect.flip(readScreenshot(root, { day: DAY, name }));
          assert.strictEqual(error.reason, "invalid_name", name);
        }
        const missing = yield* Effect.flip(readScreenshot(root, { day: DAY, name: `${HEX}.png` }));
        assert.strictEqual(missing.reason, "file_not_found");
      }),
    ),
  );
});
