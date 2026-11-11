/**
 * Start-on-demand wrapper for an image source. ComfyUI holds graphics memory while it idles.
 * This wrapper starts it on the first image request, frees its memory shortly after the queue
 * ends, and stops it after a long idle time. It stops only a process that it started itself.
 */
import { ImageCancelledError, type ImageSource } from "./imageSource.ts";

export interface LaunchConfig {
  /** Shell command that starts ComfyUI, for example `python main.py --port 8188`. */
  readonly command: string;
  readonly args?: readonly string[];
  /** Folder to run the command in. Null runs it in the server folder. */
  readonly folder: string | null;
  /** Minutes without an image before ComfyUI stops. */
  readonly idleMinutes: number;
}

export interface LaunchedProcess {
  readonly kill: () => void;
  readonly hasExited: () => boolean;
}

export interface OnDemandDeps {
  /** Read on each request, so a change in the setting needs no restart. Null: never start. */
  readonly readConfig: () => LaunchConfig | null;
  readonly launch: (config: LaunchConfig) => LaunchedProcess | Promise<LaunchedProcess>;
  readonly setTimer: (run: () => void, ms: number) => unknown;
  readonly clearTimer: (timer: unknown) => void;
  readonly sleep: (ms: number) => Promise<void>;
}

/** After the last image, free the models from graphics memory once this time passes. */
export const FREE_AFTER_MS = 20_000;
const START_TIMEOUT_MS = 120_000;
const START_POLL_MS = 2_000;

export interface OnDemandSource extends ImageSource {
  /** Stop the owned idle engine so the next request reads the new configuration. */
  readonly reset: () => void;
  /** Stop a process that this wrapper started. Call it when the server stops. */
  readonly dispose: () => void;
}

export function withOnDemandStart(source: ImageSource, deps: OnDemandDeps): OnDemandSource {
  let child: LaunchedProcess | null = null;
  let starting: Promise<void> | null = null;
  let freeTimer: unknown = null;
  let stopTimer: unknown = null;
  let disposed = false;

  const clearTimers = () => {
    if (freeTimer !== null) deps.clearTimer(freeTimer);
    if (stopTimer !== null) deps.clearTimer(stopTimer);
    freeTimer = null;
    stopTimer = null;
  };

  const stopChild = () => {
    const running = child;
    child = null;
    if (running && !running.hasExited()) running.kill();
  };

  const armIdle = () => {
    clearTimers();
    if (disposed) return;
    if (child === null) return;
    const config = deps.readConfig();
    freeTimer = deps.setTimer(() => {
      void source.freeMemory?.();
    }, FREE_AFTER_MS);
    stopTimer = deps.setTimer(
      () => {
        stopChild();
      },
      Math.max(1, config?.idleMinutes ?? 10) * 60_000,
    );
  };

  const waitUntilOnline = async (signal?: AbortSignal) => {
    for (let waited = 0; waited < START_TIMEOUT_MS; waited += START_POLL_MS) {
      if (disposed) throw new Error("The image engine was stopped.");
      if (signal?.aborted) throw new ImageCancelledError();
      if (child?.hasExited()) {
        throw new Error(
          "The image engine stopped during startup. Check its installation and try again.",
        );
      }
      if ((await source.status()).online) return;
      await deps.sleep(START_POLL_MS);
    }
    throw new Error("ComfyUI did not start in time. Check the start command in the settings.");
  };

  const ensureRunning = async (signal?: AbortSignal) => {
    if (signal?.aborted) throw new ImageCancelledError();
    if (disposed) throw new Error("The image engine was stopped.");
    const config = deps.readConfig();
    if (child?.hasExited()) child = null;
    if ((config?.args === undefined || child !== null) && (await source.status()).online) return;
    // No start command: keep the old behaviour, where the person starts ComfyUI by hand.
    if (config === null) return;
    if (starting === null) {
      starting = (async () => {
        try {
          if (child?.hasExited()) child = null;
          if (child === null) {
            if (signal?.aborted) throw new ImageCancelledError();
            const launched = await deps.launch(config);
            if (signal?.aborted) {
              if (!launched.hasExited()) launched.kill();
              throw new ImageCancelledError();
            }
            if (disposed) {
              if (!launched.hasExited()) launched.kill();
              throw new Error("The image engine was stopped.");
            }
            child = launched;
          }
          await waitUntilOnline(signal);
        } catch (cause) {
          stopChild();
          throw cause;
        } finally {
          starting = null;
        }
      })();
    }
    await starting;
  };

  return {
    ...source,
    generate: async (request, hooks) => {
      clearTimers();
      try {
        await ensureRunning(hooks?.signal);
        if (hooks?.signal?.aborted) throw new ImageCancelledError();
        return await source.generate(request, hooks);
      } finally {
        armIdle();
      }
    },
    dispose: () => {
      disposed = true;
      clearTimers();
      stopChild();
    },
    reset: () => {
      clearTimers();
      stopChild();
    },
  };
}
