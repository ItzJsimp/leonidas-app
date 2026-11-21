import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

import * as DesktopIpc from "../DesktopIpc.ts";
import { SET_SCRIBE_WORKSPACE_CHANNEL } from "../channels.ts";

const writes = Semaphore.makeUnsafe(1);

export class ScribeWorkspacePathError extends Schema.TaggedError<ScribeWorkspacePathError>()(
  "ScribeWorkspacePathError",
  { workspaceRoot: Schema.String },
) {
  override get message(): string {
    return "Scribe requires an absolute workspace path";
  }
}

const encodeWorkspaceFile = Schema.encodeSync(
  Schema.fromJsonString(
    Schema.Struct({ workspaceRoot: Schema.NullOr(Schema.String), sampledAt: Schema.Number }),
  ),
);

export const setScribeWorkspace = DesktopIpc.makeIpcMethod({
  channel: SET_SCRIBE_WORKSPACE_CHANNEL,
  payload: Schema.NullOr(Schema.String.check(Schema.isMaxLength(4096))),
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.scribeWorkspace.set")(function* (workspaceRoot) {
    const platform = yield* HostProcess.Platform;
    if (platform !== "win32") return;
    const env = yield* HostProcess.Environment;
    if (!env.LOCALAPPDATA) return;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (workspaceRoot !== null && !path.isAbsolute(workspaceRoot)) {
      return yield* new ScribeWorkspacePathError({ workspaceRoot });
    }
    const folder = env.LEONIDAS_SCRIBE_HOT_DIR ?? path.join(env.LOCALAPPDATA, "LeonidasScribe");
    yield* fs.makeDirectory(folder, { recursive: true });
    const target = path.join(folder, "code-workspace.json");
    const now = yield* Clock.currentTimeMillis;
    yield* fs.writeFileString(
      target + ".tmp",
      encodeWorkspaceFile({ workspaceRoot, sampledAt: now / 1000 }),
    );
    yield* fs.rename(target + ".tmp", target);
  }, writes.withPermit),
});
