import { TradingStateError } from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { writeWorkspaceFile, type AiosWorkspaceType } from "../taskBoard/aiosWorkspaces.ts";
import { readDayNote, saveDayNote } from "./tradingDays.ts";

const withWorkspace = <A, E>(
  type: AiosWorkspaceType,
  body: (root: string) => Effect.Effect<A, E, FileSystem.FileSystem | Path.Path>,
) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "leonidas-trading-days-" });
    writeWorkspaceFile(root, { id: "trading-test", name: "Trading test", type });
    return yield* body(root);
  }).pipe(Effect.scoped);

it.layer(NodeServices.layer)("trading day notes", (it) => {
  it.effect("round trips a note as plain Markdown, and a day with no file reads empty", () =>
    withWorkspace("trading", (root) =>
      Effect.gen(function* () {
        assert.strictEqual((yield* readDayNote(root, { day: "2026-03-04" })).note, "");
        const note = "## What went well\n\nClean entries.\n\n## What to fix\n\n## How I felt\n";
        yield* saveDayNote(root, { day: "2026-03-04", note });
        assert.strictEqual((yield* readDayNote(root, { day: "2026-03-04" })).note, note);
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const file = path.join(root, "trading", "days", "2026-03-04.md");
        assert.strictEqual(yield* fs.readFileString(file), note);
      }),
    ),
  );

  it.effect("rejects a day that is not YYYY-MM-DD", () =>
    withWorkspace("trading", (root) =>
      Effect.gen(function* () {
        const read = yield* Effect.flip(readDayNote(root, { day: "2026-3-4" }));
        assert.instanceOf(read, TradingStateError);
        assert.strictEqual(read.reason, "invalid_day");
        const save = yield* Effect.flip(saveDayNote(root, { day: "2026-03-04T", note: "x" }));
        assert.strictEqual(save.reason, "invalid_day");
      }),
    ),
  );

  it.effect("rejects a path escape in the day and writes nothing outside trading/days", () =>
    withWorkspace("trading", (root) =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          saveDayNote(root, { day: "../../2026-03-04", note: "escaped" }),
        );
        assert.strictEqual(error.reason, "invalid_day");
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        assert.isFalse(yield* fs.exists(path.join(root, "trading", "2026-03-04.md")));
      }),
    ),
  );

  it.effect("caps the note at 20,000 characters", () =>
    withWorkspace("trading", (root) =>
      Effect.gen(function* () {
        yield* saveDayNote(root, { day: "2026-03-04", note: "a".repeat(20_000) });
        const error = yield* Effect.flip(
          saveDayNote(root, { day: "2026-03-04", note: "a".repeat(20_001) }),
        );
        assert.strictEqual(error.reason, "note_too_long");
      }),
    ),
  );

  it.effect("refuses a workspace that is not a Trading workspace", () =>
    withWorkspace("personal", (root) =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(saveDayNote(root, { day: "2026-03-04", note: "x" }));
        assert.strictEqual(error.reason, "not_a_trading_workspace");
      }),
    ),
  );
});
