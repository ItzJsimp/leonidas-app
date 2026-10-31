// @effect-diagnostics nodeBuiltinImport:off - builds a folder path inside the AIOS.
import * as Effect from "effect/Effect";
import * as NodePath from "node:path";

import * as ProjectService from "../project/ProjectService.ts";
import { forkParked } from "../serverActivation.ts";
import { TaskBoardService } from "../taskBoard/TaskBoardService.ts";
import { ScribeEngine } from "./ScribeEngine.ts";

/**
 * The folder to turn word sync on with, or null to leave it alone. Only a user who never chose
 * a folder gets one: a saved blank means the user turned sync off, so the key being present at
 * all (even blank) stops this rule.
 */
export function autoWordSyncDir(
  features: Readonly<Record<string, unknown>>,
  aiosRoot: string | null,
): string | null {
  if (aiosRoot === null || "wordSyncDir" in features) return null;
  const path = aiosRoot.includes("\\") ? NodePath.win32 : NodePath.posix;
  return path.join(aiosRoot, "scribe", "words");
}

/** Every minute, sets the word sync folder to `<AIOS>/scribe/words` for a user who never set one. */
export const make = Effect.gen(function* () {
  const engine = yield* ScribeEngine;
  const projectService = yield* ProjectService.ProjectService;
  const taskBoard = yield* TaskBoardService;

  const check = Effect.gen(function* () {
    const { features } = (yield* engine.getSettings).sections;
    // Read the setting first, so a settled user costs one small engine call and no project scan.
    if ("wordSyncDir" in features) return;
    const aiosRoot = yield* taskBoard.aiosRoot((yield* projectService.snapshot).projects);
    const dir = autoWordSyncDir(features, aiosRoot);
    if (dir !== null) {
      yield* engine.patchSettings({ section: "features", values: { wordSyncDir: dir } });
    }
    // An engine that is down or a missing AIOS is not an error: the next minute tries again.
  }).pipe(Effect.ignore);

  const start = Effect.fn("WordSyncAutoSetup.start")(function* () {
    yield* forkParked(Effect.forever(check.pipe(Effect.andThen(Effect.sleep("60 seconds")))));
  });

  return { start };
});
