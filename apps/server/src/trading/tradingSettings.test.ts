import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { writeWorkspaceFile, type AiosWorkspaceType } from "../taskBoard/aiosWorkspaces.ts";
import {
  DEFAULT_SETTINGS,
  readTradingSettings,
  saveTradingSetting,
  saveTradingSettings,
} from "./tradingSettings.ts";

const withWorkspace = <A, E>(
  type: AiosWorkspaceType,
  body: (root: string) => Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "leonidas-trading-settings-" });
    writeWorkspaceFile(root, { id: "trading-test", name: "Trading test", type });
    return yield* body(root);
  }).pipe(Effect.scoped);

/** Writes `trading/settings.json` with made-up text. */
const writeSettings = (root: string, text: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.makeDirectory(path.join(root, "trading"), { recursive: true });
    yield* fs.writeFileString(path.join(root, "trading", "settings.json"), text);
  });

const readFile = (root: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return yield* fs.readFileString(path.join(root, "trading", "settings.json"));
  });

it.layer(NodeServices.layer)("tradingSettings", (it) => {
  it.effect("merges one key and keeps every other key in the file", () =>
    withWorkspace("trading", (root) =>
      Effect.gen(function* () {
        yield* writeSettings(
          root,
          JSON.stringify({ traderName: "Test Trader", monthlyFeeCap: 100, extra: { kept: true } }),
        );
        const saved = yield* saveTradingSetting(root, "monthlyFeeCap", 250);
        assert.deepEqual(saved, {
          ...DEFAULT_SETTINGS,
          traderName: "Test Trader",
          monthlyFeeCap: 250,
        });
        const onDisk = JSON.parse(yield* readFile(root));
        assert.deepEqual(onDisk, {
          traderName: "Test Trader",
          monthlyFeeCap: 250,
          extra: { kept: true },
        });
      }),
    ),
  );

  it.effect("creates the file when none exists, and null removes the cap", () =>
    withWorkspace("trading", (root) =>
      Effect.gen(function* () {
        assert.deepEqual(yield* saveTradingSetting(root, "monthlyFeeCap", 500), {
          ...DEFAULT_SETTINGS,
          monthlyFeeCap: 500,
        });
        assert.deepEqual(yield* saveTradingSetting(root, "monthlyFeeCap", null), {
          ...DEFAULT_SETTINGS,
          monthlyFeeCap: null,
        });
        assert.deepEqual(JSON.parse(yield* readFile(root)), { monthlyFeeCap: null });
      }),
    ),
  );

  it.effect("rejects a negative, NaN or too large cap and writes nothing", () =>
    withWorkspace("trading", (root) =>
      Effect.gen(function* () {
        for (const value of [-1, Number.NaN, 1_000_001]) {
          const error = yield* Effect.flip(saveTradingSetting(root, "monthlyFeeCap", value));
          assert.strictEqual(error.reason, "invalid_settings");
        }
        const reading = yield* readTradingSettings(root);
        assert.deepEqual(reading, {
          settings: { ...DEFAULT_SETTINGS, monthlyFeeCap: null },
          settingsUnreadable: false,
        });
      }),
    ),
  );

  it.effect("does not overwrite an unreadable file and reports read_failed", () =>
    withWorkspace("trading", (root) =>
      Effect.gen(function* () {
        const broken = '{ "traderName": "Test Trader", ';
        yield* writeSettings(root, broken);
        const error = yield* Effect.flip(saveTradingSetting(root, "monthlyFeeCap", 300));
        assert.strictEqual(error.reason, "read_failed");
        assert.strictEqual(yield* readFile(root), broken);
      }),
    ),
  );

  it.effect("reads defaults and flags a bad file, a bad cap and a file over 100 KB", () =>
    withWorkspace("trading", (root) =>
      Effect.gen(function* () {
        const cases: readonly string[] = [
          "{ not json",
          "[1, 2]",
          JSON.stringify({ monthlyFeeCap: "a lot" }),
          JSON.stringify({ monthlyFeeCap: 2_000_000 }),
          JSON.stringify({ padding: "x".repeat(101 * 1024) }),
        ];
        for (const text of cases) {
          yield* writeSettings(root, text);
          const reading = yield* readTradingSettings(root);
          assert.deepEqual(reading, {
            settings: { ...DEFAULT_SETTINGS, monthlyFeeCap: null },
            settingsUnreadable: true,
          });
        }
      }),
    ),
  );

  it.effect("treats a missing file as no settings, not as unreadable", () =>
    withWorkspace("trading", (root) =>
      Effect.gen(function* () {
        const reading = yield* readTradingSettings(root);
        assert.deepEqual(reading, {
          settings: { ...DEFAULT_SETTINGS, monthlyFeeCap: null },
          settingsUnreadable: false,
        });
      }),
    ),
  );
  it.effect("saves the Crew keys, rejects bad ones, and never loses a key in parallel saves", () =>
    withWorkspace("trading", (root) =>
      Effect.gen(function* () {
        yield* writeSettings(root, JSON.stringify({ extra: 1 }));
        yield* Effect.all(
          [
            saveTradingSettings(root, { traderName: "Ada" }),
            saveTradingSettings(root, { crewSync: true }),
            saveTradingSettings(root, {
              share: { journey: true, habits: false, payouts: false, money: false },
            }),
          ],
          { concurrency: "unbounded" },
        );
        assert.deepEqual(JSON.parse(yield* readFile(root)), {
          extra: 1,
          traderName: "Ada",
          crewSync: true,
          share: { journey: true, habits: false, payouts: false, money: false },
        });
        for (const bad of [
          { traderName: "" },
          { traderName: "x".repeat(41) },
          { crewSync: "yes" },
          { share: { journey: true } },
        ]) {
          const error = yield* Effect.flip(saveTradingSettings(root, bad));
          assert.strictEqual(error.reason, "invalid_settings");
        }
      }),
    ),
  );
});
