// @effect-diagnostics nodeBuiltinImport:off globalDate:off - a plain async runner that shells out to the Game Mode control script and keeps a short cache.
import * as NodeChildProcess from "node:child_process";
import * as NodePath from "node:path";

import type { GameModeAction, GameModeStatus } from "@t3tools/contracts";

// shortcut: the AIOS folder is fixed, read it from the active workspace when a second machine needs this.
const AIOS_ROOT = process.env.LEONIDAS_AIOS_ROOT ?? "D:\\Leonidas AIOS";
const SCRIPT = NodePath.join(AIOS_ROOT, "scripts", "GameMode", "Set-GameMode.ps1");

const ACTION_ARG: Record<GameModeAction | "status", string> = {
  on: "On",
  off: "Off",
  auto: "Auto",
  vddOff: "VddOff",
  vddOn: "VddOn",
  status: "Status",
};

type Run = (action: string) => Promise<string>;

const runScript: Run = (action) =>
  new Promise((resolve, reject) => {
    NodeChildProcess.execFile(
      "pwsh",
      ["-NoProfile", "-NonInteractive", "-File", SCRIPT, "-Action", action],
      { timeout: 30_000, windowsHide: true },
      (error, stdout, stderr) =>
        error ? reject(new Error(stderr.trim() || error.message)) : resolve(stdout),
    );
  });

const UNKNOWN: Omit<GameModeStatus, "error"> = {
  mode: "auto",
  watcher: false,
  throttled: 0,
  virtualDisplay: "on",
};

/** The control script prints one JSON line last. Anything before it is ignored. */
export function parseStatus(stdout: string): GameModeStatus {
  const line = stdout.trim().split(/\r?\n/).at(-1) ?? "";
  const value = JSON.parse(line) as Omit<GameModeStatus, "error">;
  return {
    mode: value.mode,
    watcher: value.watcher,
    throttled: value.throttled,
    virtualDisplay: value.virtualDisplay,
    error: null,
  };
}

/**
 * Reads and changes Game Mode through `Set-GameMode.ps1`. A status read starts a PowerShell
 * process, so reads inside `ttlMs` share one answer. An action clears that answer.
 */
export function makeGameModeRunner(run: Run = runScript, ttlMs = 5_000) {
  let held: { at: number; value: GameModeStatus } | undefined;

  const call = async (action: GameModeAction | "status"): Promise<GameModeStatus> => {
    if (process.platform !== "win32") {
      return { ...UNKNOWN, error: "Game Mode runs on Windows only." };
    }
    try {
      const value = parseStatus(await run(ACTION_ARG[action]));
      held = { at: Date.now(), value };
      return value;
    } catch (error) {
      // Not held, so the next read retries at once.
      held = undefined;
      return { ...UNKNOWN, error: error instanceof Error ? error.message : String(error) };
    }
  };

  return {
    status: async (): Promise<GameModeStatus> =>
      held && Date.now() - held.at < ttlMs ? held.value : call("status"),
    act: (action: GameModeAction): Promise<GameModeStatus> => {
      held = undefined;
      return call(action);
    },
  };
}

const runner = makeGameModeRunner();
export const readGameModeStatus = runner.status;
export const runGameModeAction = runner.act;
