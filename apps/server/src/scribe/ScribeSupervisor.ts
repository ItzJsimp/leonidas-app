import type { ScribeEngineProcess } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import * as ScribeStatus from "./ScribeStatus.ts";

/**
 * Keeps the Scribe engine process alive. It starts the binary named by
 * `LEONIDAS_SCRIBE_ENGINE_BIN` (with `--config` from `LEONIDAS_SCRIBE_ENGINE_CONFIG`
 * when set, so a dev engine can use its own port and hotkeys), restarts it when it exits or stops answering
 * `/v1/status`, and backs off after repeated fast crashes. Without a binary it
 * reports `unmanaged` and touches nothing (Python Scribe or the mock may run).
 */
export class ScribeSupervisor extends Context.Service<
  ScribeSupervisor,
  {
    readonly current: Effect.Effect<ScribeEngineProcess>;
    /** The current value on subscribe, then each change. */
    readonly changes: Stream.Stream<ScribeEngineProcess>;
  }
>()("t3/scribe/ScribeSupervisor") {}

export interface SupervisorOptions {
  readonly bin: string | null;
  readonly args?: ReadonlyArray<string>;
  /** Wait after an exit before the next start. */
  readonly restartDelay?: Duration.Input;
  /** A run shorter than this counts as a fast crash. */
  readonly fastCrashMillis?: number;
  readonly maxFastCrashes?: number;
  readonly backoff?: Duration.Input;
  /** Answers true while the engine serves `/v1/status`. */
  readonly healthy?: Effect.Effect<boolean>;
  readonly healthEvery?: Duration.Input;
  /** Misses in a row before a running engine is killed and restarted. */
  readonly healthMisses?: number;
  /** No health checks during this time after a start. */
  readonly startGrace?: Duration.Input;
}

const UNMANAGED: ScribeEngineProcess = { status: "unmanaged", restarts: 0, lastRestartAt: null };

export const makeWith = (options: SupervisorOptions) =>
  Effect.gen(function* () {
    const ref = yield* SubscriptionRef.make<ScribeEngineProcess>(UNMANAGED);
    const service = ScribeSupervisor.of({
      current: SubscriptionRef.get(ref),
      changes: SubscriptionRef.changes(ref),
    });
    const bin = options.bin;
    if (bin === null) return service;

    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const healthy = options.healthy ?? Effect.succeed(true);
    const healthMisses = options.healthMisses ?? 3;
    const fastCrashMillis = options.fastCrashMillis ?? 10_000;
    const maxFastCrashes = options.maxFastCrashes ?? 3;

    let restarts = 0;
    let lastRestartAt: string | null = null;
    let fastCrashes = 0;
    const publish = (status: ScribeEngineProcess["status"]) =>
      SubscriptionRef.set(ref, { status, restarts, lastRestartAt });

    // Resolves when the engine misses `healthMisses` checks in a row.
    const unhealthy = Effect.gen(function* () {
      yield* Effect.sleep(options.startGrace ?? "5 seconds");
      let misses = 0;
      while (misses < healthMisses) {
        misses = (yield* healthy) ? 0 : misses + 1;
        if (misses < healthMisses) yield* Effect.sleep(options.healthEvery ?? "2 seconds");
      }
    });

    const runOnce = Effect.scoped(
      Effect.gen(function* () {
        yield* publish("starting");
        const child = yield* spawner.spawn(
          ChildProcess.make(bin, [...(options.args ?? [])], {
            detached: false,
            shell: false,
            stdin: "ignore",
            stdout: "ignore",
            stderr: "ignore",
          }),
        );
        yield* publish("running");
        // Closing the scope kills the child, so a hung engine is killed here too.
        yield* Effect.raceFirst(Effect.ignore(child.exitCode), unhealthy);
      }),
    );

    const loop = Effect.gen(function* () {
      while (true) {
        // An engine we did not start already serves the port (the app's previous run left it).
        // A second one would fail to bind and crash-loop, so wait until it is gone.
        if (options.healthy && (yield* options.healthy)) {
          yield* publish("running");
          yield* Effect.sleep(options.healthEvery ?? "2 seconds");
          continue;
        }
        const startedAt = yield* Clock.currentTimeMillis;
        yield* Effect.ignore(runOnce);
        const ranFor = (yield* Clock.currentTimeMillis) - startedAt;
        fastCrashes = ranFor < fastCrashMillis ? fastCrashes + 1 : 0;
        yield* publish("crashed");
        yield* Effect.logWarning("Scribe engine exited; restarting", { ranFor, fastCrashes });
        yield* Effect.sleep(
          fastCrashes >= maxFastCrashes
            ? (options.backoff ?? "30 seconds")
            : (options.restartDelay ?? "250 millis"),
        );
        if (fastCrashes >= maxFastCrashes) fastCrashes = 0;
        restarts += 1;
        lastRestartAt = DateTime.formatIso(yield* DateTime.now);
      }
    });

    yield* Effect.forkScoped(loop);
    return service;
  });

/**
 * Engine flags: `--config <path>` when `LEONIDAS_SCRIBE_ENGINE_CONFIG` is set, and always
 * `--parent-pid` so the engine exits when this server does and is never left behind by an update.
 */
export function engineArgs(
  env: Readonly<Record<string, string | undefined>>,
  parentPid: number = process.pid,
): string[] {
  const config = env.LEONIDAS_SCRIBE_ENGINE_CONFIG?.trim();
  return [...(config ? ["--config", config] : []), "--parent-pid", String(parentPid)];
}

export const layer = Layer.effect(
  ScribeSupervisor,
  Effect.gen(function* () {
    const bin = process.env.LEONIDAS_SCRIBE_ENGINE_BIN?.trim() || null;
    const status = yield* ScribeStatus.ScribeStatus;
    return yield* makeWith({
      bin,
      args: engineArgs(process.env),
      healthy: Effect.map(status.get, (result) => result.status === "available"),
    });
  }),
);
