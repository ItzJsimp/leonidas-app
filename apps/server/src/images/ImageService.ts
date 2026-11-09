// @effect-diagnostics nodeBuiltinImport:off preferSchemaOverJson:off - The base address is a tiny settings file in the state folder.
/**
 * Images service: the Effect wrapper around the plain `ImagesEngine`.
 * It turns the engine into RPC methods and a live state stream for the Images panel.
 */
import {
  ImagesError,
  type ImagesCancelInput,
  type ImagesGenerateInput,
  type ImagesGenerateResult,
  type ImagesKeepInput,
  type ImagesRetryInput,
  type ImagesSetBaseUrlInput,
  type ImagesState,
  type Project,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";
import * as NodeFS from "node:fs";
import * as NodeChildProcess from "node:child_process";
import * as NodePath from "node:path";
import * as HostProcess from "@t3tools/shared/HostProcess";

import * as ServerConfig from "../config.ts";
import { DEFAULT_COMFY_URL, createComfyAdapter, normalizeBaseUrl } from "./comfyAdapter.ts";
import { ImagesEngine } from "./ImagesEngine.ts";
import { withOnDemandStart, type LaunchConfig } from "./onDemandSource.ts";

/** How often the panel re-checks that ComfyUI answers while it is open. */
const STATUS_POLL_MS = 5_000;

export class ImageService extends Context.Service<
  ImageService,
  {
    /** Live state of one project: connection, models, queue and finished images. */
    readonly subscribe: (project: Project) => Stream.Stream<ImagesState, ImagesError>;
    readonly generate: (
      project: Project,
      input: ImagesGenerateInput,
    ) => Effect.Effect<ImagesGenerateResult, ImagesError>;
    readonly cancel: (
      input: ImagesCancelInput,
    ) => Effect.Effect<{ readonly cancelled: number }, ImagesError>;
    readonly keep: (
      project: Project,
      input: ImagesKeepInput,
    ) => Effect.Effect<{ readonly kept: boolean }, ImagesError>;
    readonly retry: (
      project: Project,
      input: ImagesRetryInput,
    ) => Effect.Effect<{ readonly queued: number }, ImagesError>;
    readonly setBaseUrl: (
      input: ImagesSetBaseUrlInput,
    ) => Effect.Effect<{ readonly baseUrl: string }, ImagesError>;
  }
>()("t3/images/ImageService") {}

const readSavedBaseUrl = (file: string): string | null => {
  try {
    const value = JSON.parse(NodeFS.readFileSync(file, "utf8")) as { baseUrl?: unknown };
    return typeof value.baseUrl === "string" ? normalizeBaseUrl(value.baseUrl) : null;
  } catch {
    return null;
  }
};

const readSettings = (file: string): Record<string, unknown> => {
  try {
    const value: unknown = JSON.parse(NodeFS.readFileSync(file, "utf8"));
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

/**
 * The start setting lives in the same file as the base address: `startCommand`, `startFolder`
 * and `idleMinutes`. Without `startCommand` the person starts ComfyUI by hand, as before.
 */
const readLaunchConfig = (file: string): LaunchConfig | null => {
  const settings = readSettings(file);
  const command =
    typeof settings["startCommand"] === "string" ? settings["startCommand"].trim() : "";
  if (command.length === 0) return null;
  const folder = typeof settings["startFolder"] === "string" ? settings["startFolder"].trim() : "";
  const idle = settings["idleMinutes"];
  return {
    command,
    folder: folder.length > 0 ? folder : null,
    idleMinutes: typeof idle === "number" && idle >= 1 ? Math.round(idle) : 10,
  };
};

/** Start the command in the background. The returned kill stops the whole process tree. */
const launchComfy = (config: LaunchConfig, platform: NodeJS.Platform) => {
  const child = NodeChildProcess.spawn(config.command, {
    cwd: config.folder ?? undefined,
    shell: true,
    stdio: "ignore",
    windowsHide: true,
  });
  let exited = false;
  child.once("error", () => {
    exited = true;
  });
  child.once("exit", () => {
    exited = true;
  });
  const pid = child.pid;
  return {
    hasExited: () => exited,
    kill: () => {
      if (pid === undefined || exited) return;
      if (platform === "win32") {
        NodeChildProcess.execFile("taskkill", ["/PID", String(pid), "/T", "/F"], () => undefined);
      } else {
        child.kill();
      }
    },
  };
};

const make = Effect.gen(function* () {
  const platform = yield* HostProcess.Platform;
  const config = yield* ServerConfig.ServerConfig;
  const settingsFile = NodePath.join(config.stateDir, "images", "settings.json");
  let baseUrl = readSavedBaseUrl(settingsFile) ?? DEFAULT_COMFY_URL;

  const changes = yield* PubSub.sliding<void>(1);
  const source = withOnDemandStart(createComfyAdapter({ baseUrl: () => baseUrl }), {
    readConfig: () => readLaunchConfig(settingsFile),
    launch: (launchConfig) => launchComfy(launchConfig, platform),
    // Effect timers keep the timer and the wait on the same fiber system as the rest of the server.
    setTimer: (run, ms) => Effect.runFork(Effect.andThen(Effect.sleep(ms), Effect.sync(run))),
    clearTimer: (timer) => {
      Effect.runFork(Fiber.interrupt(timer as Fiber.Fiber<void>));
    },
    sleep: (ms) => Effect.runPromise(Effect.sleep(ms)),
  });
  yield* Effect.addFinalizer(() => Effect.sync(() => source.dispose()));
  const engine = new ImagesEngine({
    source,
    onChange: () => {
      PubSub.publishUnsafe(changes, undefined);
    },
  });
  yield* Effect.promise(() => engine.loadModels());

  const storage = (cause: unknown) =>
    new ImagesError({
      reason: "storage",
      detail: cause instanceof Error ? cause.message : String(cause),
    });

  const subscribe = (project: Project): Stream.Stream<ImagesState, ImagesError> =>
    Stream.unwrap(
      Effect.gen(function* () {
        yield* Effect.tryPromise({
          try: () => engine.hydrate(project.workspaceRoot),
          catch: storage,
        });
        const snapshot = Effect.sync(() => engine.snapshot(project.workspaceRoot));
        // The first snapshot goes out at once. The tick checks the connection and publishes a change.
        const polling = Stream.tick(STATUS_POLL_MS).pipe(
          Stream.mapEffect(() => Effect.promise(() => engine.refreshStatus())),
          Stream.drain,
        );
        const updates = Stream.concat(
          Stream.fromEffect(snapshot),
          Stream.fromPubSub(changes).pipe(Stream.mapEffect(() => snapshot)),
        );
        return Stream.merge(updates, polling);
      }),
    );

  const generate = (project: Project, input: ImagesGenerateInput) =>
    Effect.gen(function* () {
      const known = new Set((yield* Effect.promise(() => source.listModels())).map((m) => m.id));
      const unknown = input.modelIds.find((id) => !known.has(id));
      if (unknown !== undefined) {
        return yield* new ImagesError({
          reason: "invalid_input",
          detail: `Unknown model: ${unknown}`,
        });
      }
      return engine.enqueue({
        workspaceRoot: project.workspaceRoot,
        prompt: input.prompt,
        modelIds: input.modelIds,
        seed: input.seed,
        count: input.count,
      });
    });

  const keep = (project: Project, input: ImagesKeepInput) =>
    Effect.gen(function* () {
      const kept = yield* Effect.tryPromise({
        try: () =>
          engine.keep({
            workspaceRoot: project.workspaceRoot,
            itemId: input.itemId,
            kept: input.kept,
          }),
        catch: storage,
      });
      if (kept === null) {
        return yield* new ImagesError({ reason: "not_found", detail: input.itemId });
      }
      return { kept };
    });

  const retry = (project: Project, input: ImagesRetryInput) =>
    Effect.gen(function* () {
      const queued = engine.retry({ workspaceRoot: project.workspaceRoot, itemId: input.itemId });
      if (queued === null) {
        return yield* new ImagesError({ reason: "not_found", detail: input.itemId });
      }
      return { queued };
    });

  const setBaseUrl = (input: ImagesSetBaseUrlInput) =>
    Effect.gen(function* () {
      const next = normalizeBaseUrl(input.baseUrl);
      if (next === null) {
        return yield* new ImagesError({
          reason: "invalid_input",
          detail: "Use a web address such as http://127.0.0.1:8188.",
        });
      }
      yield* Effect.try({
        try: () => {
          NodeFS.mkdirSync(NodePath.dirname(settingsFile), { recursive: true });
          NodeFS.writeFileSync(
            settingsFile,
            `${JSON.stringify({ ...readSettings(settingsFile), baseUrl: next }, null, 2)}\n`,
          );
        },
        catch: storage,
      });
      baseUrl = next;
      yield* Effect.promise(() => engine.refreshStatus());
      return { baseUrl: next };
    });

  return ImageService.of({
    subscribe,
    generate,
    cancel: (input) =>
      Effect.promise(() => engine.cancel(input)).pipe(Effect.map((cancelled) => ({ cancelled }))),
    keep,
    retry,
    setBaseUrl,
  });
});

export const layer = Layer.effect(ImageService, make);
