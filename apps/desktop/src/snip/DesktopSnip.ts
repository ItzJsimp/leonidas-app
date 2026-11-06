import type { DesktopRecentSnip, DesktopSnipResult } from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";

import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import { captureMacSnip } from "./MacSnip.ts";
import { makeSnipOverlay } from "./SnipOverlay.ts";
import {
  captureSnipFrames,
  encodeSnipPng,
  isMacScreenRecordingBlocked,
  openMacScreenRecordingSettings,
  openSnipsDirectory,
  readSnipDisplays,
  readSnipImage,
  saveSnipPng,
  snipPngSize,
  snipThumbnailDataUrl,
} from "./SnipElectron.ts";
import { listSnipFiles, resolveSnipPath } from "./SnipLibrary.ts";
import { runSnip } from "./SnipRunner.ts";
import { loadWindowListApi, listVisibleWindows } from "./WindowList.ts";

const DesktopSnipOperation = Schema.Literals([
  "unsupported",
  "permission",
  "capture",
  "save",
  "list",
  "read",
  "open-folder",
]);

export class DesktopSnipError extends Schema.TaggedError<DesktopSnipError>()("DesktopSnipError", {
  operation: DesktopSnipOperation,
  cause: Schema.optional(Schema.Defect()),
}) {
  override get message(): string {
    switch (this.operation) {
      case "unsupported":
        return "Snipping is not available on this computer yet.";
      case "permission":
        return "Allow Leonidas to record your screen: open System Settings, Privacy & Security, Screen Recording, turn on Leonidas, then reopen the app.";
      case "capture":
        return "Could not capture the screen.";
      case "save":
        return "Could not save the snip.";
      case "list":
        return "Could not list your recent snips.";
      case "read":
        return "Could not open that snip.";
      case "open-folder":
        return "Could not open the snips folder.";
    }
  }
}

export class DesktopSnip extends Context.Service<
  DesktopSnip,
  {
    /** Freeze the screen, let the user pick a window or region, save it, and return it. */
    readonly start: Effect.Effect<DesktopSnipResult, DesktopSnipError>;
    readonly listRecent: Effect.Effect<ReadonlyArray<DesktopRecentSnip>, DesktopSnipError>;
    readonly read: (path: string) => Effect.Effect<DesktopSnipResult, DesktopSnipError>;
    readonly openFolder: Effect.Effect<void, DesktopSnipError>;
  }
>()("@t3tools/desktop/snip/DesktopSnip") {}

const SNIPS_FOLDER_NAME = "snips";

export const layer = Layer.effect(
  DesktopSnip,
  Effect.gen(function* () {
    const environment = yield* DesktopEnvironment.DesktopEnvironment;
    const path = yield* Path.Path;
    const snipsDirectory = path.join(environment.stateDir, SNIPS_FOLDER_NAME);
    const preloadPath = path.join(environment.dirname, "snip-overlay-preload.cjs");
    const running = yield* Ref.make(false);

    // macOS uses the system selector (drag an area, Space for a window, Esc to cancel).
    const startMac = Effect.gen(function* () {
      if (isMacScreenRecordingBlocked()) {
        yield* Effect.promise(() => openMacScreenRecordingSettings().catch(() => undefined));
        return yield* new DesktopSnipError({ operation: "permission" });
      }
      if (yield* Ref.getAndSet(running, true)) return { status: "cancelled" as const };
      const now = yield* Clock.currentTimeMillis;
      return yield* Effect.tryPromise({
        try: async (): Promise<DesktopSnipResult> => {
          const png = await captureMacSnip();
          if (png === null) return { status: "cancelled" };
          const saved = await saveSnipPng(snipsDirectory, png, now).catch(() => ({
            path: "",
            name: "snip.png",
          }));
          return {
            status: "saved",
            path: saved.path,
            name: saved.name,
            ...snipPngSize(png),
            dataUrl: `data:image/png;base64,${png.toString("base64")}`,
          };
        },
        catch: (cause) => new DesktopSnipError({ operation: "capture", cause }),
      }).pipe(Effect.ensuring(Ref.set(running, false)));
    });

    const start = Effect.gen(function* () {
      if ((yield* HostProcess.Platform) === "darwin") return yield* startMac;
      if (!(yield* HostProcess.isWindows)) {
        return yield* new DesktopSnipError({ operation: "unsupported" });
      }
      // A second request while the overlay is open would stack overlays.
      if (yield* Ref.getAndSet(running, true)) return { status: "cancelled" as const };
      const now = yield* Clock.currentTimeMillis;
      const overlay = makeSnipOverlay({ preloadPath });
      return yield* Effect.tryPromise({
        try: async () => {
          const windowApi = await loadWindowListApi();
          return await runSnip({
            displays: readSnipDisplays(),
            captureFrames: captureSnipFrames,
            listWindows: () => listVisibleWindows(windowApi),
            pick: overlay.pick,
            encodePng: encodeSnipPng,
            save: (png) => saveSnipPng(snipsDirectory, png, now),
            release: overlay.release,
          });
        },
        catch: (cause) => new DesktopSnipError({ operation: "capture", cause }),
      }).pipe(
        Effect.ensuring(Effect.sync(overlay.release).pipe(Effect.andThen(Ref.set(running, false)))),
      );
    });

    return DesktopSnip.of({
      start,
      listRecent: Effect.tryPromise({
        try: async () =>
          (await listSnipFiles(snipsDirectory)).map((file) => ({
            ...file,
            dataUrl: snipThumbnailDataUrl(file.path),
          })),
        catch: (cause) => new DesktopSnipError({ operation: "list", cause }),
      }),
      read: (requested) =>
        Effect.tryPromise({
          try: async () => {
            const path = resolveSnipPath(snipsDirectory, requested);
            const image = path ? await readSnipImage(path) : null;
            if (!path || !image) throw new Error("Snip file not found.");
            return {
              status: "saved" as const,
              path,
              name: path.slice(snipsDirectory.length + 1),
              ...image,
            };
          },
          catch: (cause) => new DesktopSnipError({ operation: "read", cause }),
        }),
      openFolder: Effect.tryPromise({
        try: () => openSnipsDirectory(snipsDirectory),
        catch: (cause) => new DesktopSnipError({ operation: "open-folder", cause }),
      }),
    });
  }),
);
