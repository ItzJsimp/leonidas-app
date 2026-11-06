import { DESKTOP_RENDERER_RELOAD_SAFE_CHECK } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";

import * as ElectronApp from "../electron/ElectronApp.ts";
import * as ElectronPowerMonitor from "../electron/ElectronPowerMonitor.ts";
import * as ElectronWindow from "../electron/ElectronWindow.ts";

/*
  A long session grows the main renderer without bound (measured about
  110 MB per hour, up to 4.6 GB after 27 hours). Until the leak is found, a
  reload while the user is away gives the memory back. Turns run in the
  server process, so a reload interrupts no agent work; the renderer still
  vetoes a reload while an agent runs or waits, or a dialog is open.
*/
export const RENDERER_MEMORY_LIMIT_BYTES = 2 * 1024 ** 3;
const RENDERER_OVER_LIMIT_SAMPLES = 3;
export const RENDERER_RELOAD_IDLE_SECONDS = 10 * 60;
export const RENDERER_RELOAD_COOLDOWN_MS = 60 * 60_000;
const SAMPLE_INTERVAL = Duration.minutes(1);
const RENDERER_CHECK_TIMEOUT = Duration.seconds(5);

export interface RendererMemoryWatchdogState {
  readonly overLimitSamples: number;
  readonly lastReloadAtMs: number | null;
}

export const INITIAL_RENDERER_MEMORY_WATCHDOG_STATE: RendererMemoryWatchdogState = {
  overLimitSamples: 0,
  lastReloadAtMs: null,
};

export interface RendererMemorySample {
  readonly nowMs: number;
  readonly rendererBytes: number;
  readonly systemIdleSeconds: number;
  readonly windowVisible: boolean;
}

export type RendererMemoryDecision = "wait" | "check-renderer";

export function stepRendererMemoryWatchdog(
  state: RendererMemoryWatchdogState,
  sample: RendererMemorySample,
): { readonly state: RendererMemoryWatchdogState; readonly decision: RendererMemoryDecision } {
  const overLimitSamples =
    sample.rendererBytes > RENDERER_MEMORY_LIMIT_BYTES ? state.overLimitSamples + 1 : 0;
  const coolingDown =
    state.lastReloadAtMs !== null &&
    sample.nowMs - state.lastReloadAtMs < RENDERER_RELOAD_COOLDOWN_MS;
  const userAway =
    !sample.windowVisible || sample.systemIdleSeconds >= RENDERER_RELOAD_IDLE_SECONDS;
  const decision =
    overLimitSamples >= RENDERER_OVER_LIMIT_SAMPLES && userAway && !coolingDown
      ? "check-renderer"
      : "wait";
  return { state: { ...state, overLimitSamples }, decision };
}

export function markRendererReloaded(
  _state: RendererMemoryWatchdogState,
  nowMs: number,
): RendererMemoryWatchdogState {
  return { overLimitSamples: 0, lastReloadAtMs: nowMs };
}

const make = Effect.gen(function* () {
  const electronApp = yield* ElectronApp.ElectronApp;
  const electronWindow = yield* ElectronWindow.ElectronWindow;
  const powerMonitor = yield* ElectronPowerMonitor.ElectronPowerMonitor;
  let state = INITIAL_RENDERER_MEMORY_WATCHDOG_STATE;

  const tick = Effect.gen(function* () {
    const main = yield* electronWindow.main;
    if (Option.isNone(main) || main.value.isDestroyed()) return;
    const window = main.value;
    const webContents = window.webContents;
    const pid = webContents.getOSProcessId();
    const metric = (yield* electronApp.getAppMetrics).find((entry) => entry.pid === pid);
    if (metric === undefined) return;
    // Windows trims the working set of a minimized window; private bytes do
    // not drop on a trim. Other platforms report only the working set.
    const rendererBytes = (metric.memory.privateBytes ?? metric.memory.workingSetSize) * 1024;
    const nowMs = yield* Clock.currentTimeMillis;
    const step = stepRendererMemoryWatchdog(state, {
      nowMs,
      rendererBytes,
      systemIdleSeconds: yield* powerMonitor.getSystemIdleTime,
      windowVisible: window.isVisible() && !window.isMinimized(),
    });
    state = step.state;
    if (step.decision === "wait") return;

    // An older web build has no check; a missing or slow answer means "busy".
    const safe = yield* Effect.tryPromise(() =>
      webContents.executeJavaScript(
        `globalThis.${DESKTOP_RENDERER_RELOAD_SAFE_CHECK}?.() === true`,
      ),
    ).pipe(
      Effect.timeout(RENDERER_CHECK_TIMEOUT),
      Effect.orElseSucceed(() => false),
    );
    if (safe !== true || webContents.isDestroyed()) return;

    yield* Effect.logInfo("Reloading the main window to release renderer memory", {
      rendererMb: Math.round(rendererBytes / 1024 ** 2),
    });
    state = markRendererReloaded(state, nowMs);
    webContents.reload();
  });

  yield* tick.pipe(
    Effect.catchCause((cause) => Effect.logWarning("Renderer memory watchdog check failed", cause)),
    Effect.repeat(Schedule.spaced(SAMPLE_INTERVAL)),
    Effect.forkScoped,
  );
});

export const layer = Layer.effectDiscard(make);
