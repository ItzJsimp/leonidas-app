// @effect-diagnostics nodeBuiltinImport:off - The model folder path needs the real file system.
/**
 * Local models service: the Effect wrapper around the plain `LocalModelsEngine`.
 * It turns the engine into RPC methods and a live state stream for the Models tab.
 * The stream polls Ollama only while a client is subscribed.
 */
import {
  LocalModelsError,
  type LocalModelsActionResult,
  type LocalModelsAdvice,
  type LocalModelsCompareInput,
  type LocalModelsCompareResult,
  type LocalModelsPickInput,
  type LocalModelsPickResult,
  type LocalModelsTokenReport,
  type LocalModelsTokenReportInput,
  type LocalModelsModelInput,
  type LocalModelsPullInput,
  type LocalModelsState,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as HardwareWatch from "../hardwareWatch/HardwareWatch.ts";
import { computeLocalModelCapacity } from "../hardwareWatch/localModelCapacity.ts";
import { DEFAULT_OLLAMA_URL } from "../provider/ollamaModelCatalog.ts";
import * as ServerConfig from "../config.ts";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as SqlClient from "effect/sql/SqlClient";
import { buildTokenReport } from "./tokenReport.ts";
import { readTokenReportRows } from "./tokenReportSource.ts";
import { ModelCompare, type ModelAnswer } from "./ModelCompare.ts";
import { readAdvice } from "./modelAdvisor.ts";
import { LocalModelsEngine, type LocalModelsHardware } from "./LocalModelsEngine.ts";

/** Poll rate while a download runs, and while the tab is open and idle. */
const PULLING_POLL_MS = 2_000;
const IDLE_POLL_MS = 15_000;
/** Poll rate until the first hardware reading exists, a few seconds after the server starts. */
const WAITING_FOR_HARDWARE_POLL_MS = 1_000;

export class LocalModelsService extends Context.Service<
  LocalModelsService,
  {
    readonly subscribe: Stream.Stream<LocalModelsState, LocalModelsError>;
    readonly pull: (
      input: LocalModelsPullInput,
    ) => Effect.Effect<LocalModelsActionResult, LocalModelsError>;
    readonly cancelPull: (
      input: LocalModelsModelInput,
    ) => Effect.Effect<LocalModelsActionResult, LocalModelsError>;
    readonly run: (
      input: LocalModelsModelInput,
    ) => Effect.Effect<LocalModelsActionResult, LocalModelsError>;
    readonly stop: (
      input: LocalModelsModelInput,
    ) => Effect.Effect<LocalModelsActionResult, LocalModelsError>;
    readonly startOllama: Effect.Effect<LocalModelsActionResult, LocalModelsError>;
    readonly advice: Effect.Effect<LocalModelsAdvice, LocalModelsError>;
    readonly compare: (
      input: LocalModelsCompareInput,
    ) => Effect.Effect<LocalModelsCompareResult, LocalModelsError>;
    /** One prompt on one installed model. It never pulls a model: a missing model is an error. */
    readonly answer: (input: {
      readonly model: string;
      readonly prompt: string;
    }) => Effect.Effect<ModelAnswer, LocalModelsError>;
    readonly comparePick: (
      input: LocalModelsPickInput,
    ) => Effect.Effect<LocalModelsPickResult, LocalModelsError>;
    readonly tokenReport: (
      input: LocalModelsTokenReportInput,
    ) => Effect.Effect<LocalModelsTokenReport, LocalModelsError>;
    readonly speedTest: (
      input: LocalModelsModelInput,
    ) => Effect.Effect<LocalModelsActionResult, LocalModelsError>;
    readonly remove: (
      input: LocalModelsModelInput,
    ) => Effect.Effect<LocalModelsActionResult, LocalModelsError>;
  }
>()("t3/localModels/LocalModelsService") {}

/** The folder Ollama keeps models in, with junctions resolved. Null when it does not exist. */
const resolveModelDir = (): string | null => {
  const configured = process.env["OLLAMA_MODELS"];
  const dir = configured ? configured : NodePath.join(NodeOS.homedir(), ".ollama", "models");
  try {
    return NodeFS.realpathSync(dir);
  } catch {
    return null;
  }
};

/** Start `ollama serve` detached, so it keeps running when this server stops. */
const startOllamaProcess = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const candidates = [
      "ollama",
      NodePath.join(process.env["LOCALAPPDATA"] ?? "", "Programs", "Ollama", "ollama.exe"),
    ];
    const attempt = (index: number) => {
      const command = candidates[index];
      if (command === undefined) {
        reject(new Error("Ollama is not installed. Install it from ollama.com, then try again."));
        return;
      }
      const child = NodeChildProcess.spawn(command, ["serve"], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.once("error", () => attempt(index + 1));
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    };
    attempt(0);
  });

const run = (command: string, args: ReadonlyArray<string>): Promise<string> =>
  new Promise((resolve) => {
    NodeChildProcess.execFile(
      command,
      [...args],
      { timeout: 4_000, windowsHide: true },
      (_e, out) => resolve(String(out ?? "")),
    );
  });

/** Name of the program that listens on port 11434 (Windows only; null elsewhere or when free). */
const findPortHolder = async (): Promise<string | null> => {
  if (process.platform !== "win32") return null;
  const lines = (await run("netstat", ["-ano", "-p", "tcp"])).split("\n");
  const line = lines.find((entry) => /:11434\s/.test(entry) && /LISTENING/.test(entry));
  const pid = line?.trim().split(/\s+/).pop();
  if (pid === undefined || !/^\d+$/.test(pid)) return null;
  const task = await run("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"]);
  return /^"([^"]+)"/.exec(task.trim())?.[1] ?? null;
};

const isLocalModelsError = Schema.is(LocalModelsError);

const make = Effect.gen(function* () {
  const hardwareWatch = yield* HardwareWatch.HardwareWatch;
  const config = yield* ServerConfig.ServerConfig;
  const sql = yield* SqlClient.SqlClient;
  const changes = yield* PubSub.sliding<void>(1);
  let hardware: LocalModelsHardware | null = null;

  const readHardware = Effect.gen(function* () {
    const sample = yield* hardwareWatch.latestSample;
    if (sample === null) return;
    const capacity = computeLocalModelCapacity({
      cpuThreads: NodeOS.cpus().length,
      memory: sample.memory,
      gpus: sample.gpus.map((gpu) => ({
        name: gpu.name,
        vendor: null,
        vramTotalBytes: gpu.vramTotalBytes,
        vramUsedBytes: gpu.vramUsedBytes,
      })),
      volumes: sample.volumes,
    });
    hardware = {
      capacity,
      volumes: sample.volumes.map((volume) => ({
        mount: volume.mount,
        mediaType: volume.mediaType,
        freeBytes: Math.max(0, volume.totalBytes - volume.usedBytes),
      })),
    };
  });

  const engine = new LocalModelsEngine({
    baseUrl: () => DEFAULT_OLLAMA_URL,
    fetch: globalThis.fetch,
    hardware: () => hardware,
    modelDir: resolveModelDir,
    startOllama: startOllamaProcess,
    portHolder: findPortHolder,
    sleep: (ms) => Effect.runPromise(Effect.sleep(ms)),
    onChange: () => {
      PubSub.publishUnsafe(changes, undefined);
    },
    now: () => Math.round(performance.timeOrigin + performance.now()),
  });

  const picksFile = NodePath.join(config.stateDir, "local-models", "compare-picks.jsonl");
  const modelCompare = new ModelCompare({
    answer: (model, prompt) => engine.answer(model, prompt),
    random: Math.random,
    newId: () => NodeCrypto.randomUUID(),
    now: () => Math.round(performance.timeOrigin + performance.now()),
    savePick: (line) => {
      NodeFS.mkdirSync(NodePath.dirname(picksFile), { recursive: true });
      NodeFS.appendFileSync(picksFile, `${line}\n`);
    },
  });

  const refresh = Effect.andThen(
    readHardware,
    Effect.promise(() => engine.refresh()),
  );
  const snapshot = Effect.andThen(
    readHardware,
    Effect.sync(() => engine.snapshot()),
  );

  const subscribe: Stream.Stream<LocalModelsState, LocalModelsError> = Stream.unwrap(
    Effect.gen(function* () {
      yield* refresh;
      // The poll adapts: fast while a download runs, slow otherwise.
      const polling = Stream.fromEffectRepeat(
        Effect.andThen(
          Effect.suspend(() =>
            Effect.sleep(
              hardware === null
                ? WAITING_FOR_HARDWARE_POLL_MS
                : engine.pulling
                  ? PULLING_POLL_MS
                  : IDLE_POLL_MS,
            ),
          ),
          refresh,
        ),
      ).pipe(Stream.drain);
      const updates = Stream.concat(
        Stream.fromEffect(snapshot),
        Stream.fromPubSub(changes).pipe(Stream.mapEffect(() => snapshot)),
      );
      return Stream.merge(updates, polling);
    }),
  );

  const asError = (cause: unknown): LocalModelsError =>
    isLocalModelsError(cause)
      ? cause
      : new LocalModelsError({
          reason: "ollama_down",
          detail: cause instanceof Error ? cause.message : String(cause),
        });

  const action = (run: () => unknown) =>
    Effect.tryPromise({
      try: async () => {
        await run();
        return { ok: true } as const;
      },
      catch: asError,
    });

  return LocalModelsService.of({
    subscribe,
    pull: (input) =>
      Effect.try({
        // The download runs in the background. Only the start is checked here.
        try: () => {
          void engine.pull(input.model, input.confirmed === true);
          return { ok: true } as const;
        },
        catch: asError,
      }),
    cancelPull: (input) => action(() => engine.cancelPull(input.model)),
    run: (input) => action(() => engine.run(input.model)),
    stop: (input) => action(() => engine.stop(input.model)),
    advice: Effect.promise(() =>
      readAdvice(() => Math.round(performance.timeOrigin + performance.now())),
    ),
    compare: (input) =>
      Effect.tryPromise({ try: () => modelCompare.compare(input), catch: asError }),
    // The engine knows the installed models only after a refresh, and the Models tab may be closed.
    answer: (input) =>
      Effect.andThen(
        refresh,
        Effect.tryPromise({ try: () => engine.answer(input.model, input.prompt), catch: asError }),
      ),
    comparePick: (input) => Effect.try({ try: () => modelCompare.pick(input), catch: asError }),
    tokenReport: (input) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const since = DateTime.formatIso(DateTime.makeUnsafe(now - input.days * 86_400_000));
        const rows = yield* readTokenReportRows(sql, since);
        return buildTokenReport(rows, input.days, null);
      }).pipe(Effect.mapError(asError)),
    startOllama: action(() => engine.startOllama()),
    speedTest: (input) => action(() => engine.speedTest(input.model)),
    remove: (input) => action(() => engine.remove(input.model)),
  });
});

export const layer = Layer.effect(LocalModelsService, make);
