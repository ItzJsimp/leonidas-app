import { describe, expect, it } from "vite-plus/test";

import type { ImageSource } from "./imageSource.ts";
import {
  FREE_AFTER_MS,
  withOnDemandStart,
  type LaunchConfig,
  type OnDemandDeps,
} from "./onDemandSource.ts";

const config: LaunchConfig = { command: "python main.py", folder: null, idleMinutes: 10 };

function setup(options: { config?: LaunchConfig | null; startsOnLaunch?: boolean } = {}) {
  const log: string[] = [];
  let online = false;
  let exited = false;
  const timers: Array<{ run: () => void; ms: number; live: boolean }> = [];
  const source = {
    id: "comfyui",
    label: "ComfyUI",
    address: () => "http://127.0.0.1:8188",
    listModels: async () => [],
    generate: async () => {
      log.push("generate");
      return { bytes: new Uint8Array(), mimeType: "image/png", settings: {} } as never;
    },
    status: async () => ({ online, message: null }),
    interrupt: async () => {},
    freeMemory: async () => {
      log.push("free");
    },
  } as unknown as ImageSource;
  const deps: OnDemandDeps = {
    readConfig: () => (options.config === undefined ? config : options.config),
    launch: () => {
      log.push("launch");
      exited = false;
      if (options.startsOnLaunch !== false) online = true;
      return {
        hasExited: () => exited,
        kill: () => {
          log.push("kill");
          online = false;
        },
      };
    },
    setTimer: (run, ms) => {
      const timer = { run, ms, live: true };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      (timer as (typeof timers)[number]).live = false;
    },
    sleep: async () => {},
  };
  return {
    wrapped: withOnDemandStart(source, deps),
    log,
    timers,
    crash: () => {
      exited = true;
      online = false;
    },
  };
}

const request = { modelId: "m", prompt: "p", seed: 1 };

describe("withOnDemandStart", () => {
  it("starts a new process after the engine exits", async () => {
    const { wrapped, log, crash } = setup();
    await wrapped.generate(request);
    crash();
    await wrapped.generate(request);
    expect(log).toEqual(["launch", "generate", "launch", "generate"]);
    wrapped.dispose();
  });

  it("does not kill an exited process when disposed", async () => {
    const { wrapped, log, crash } = setup();
    await wrapped.generate(request);
    crash();
    wrapped.dispose();
    expect(log).not.toContain("kill");
  });
  it("starts ComfyUI on the first image, then frees memory and stops it when idle", async () => {
    const { wrapped, log, timers } = setup();
    await wrapped.generate(request);
    expect(log).toEqual(["launch", "generate"]);
    const live = timers.filter((timer) => timer.live);
    expect(live.map((timer) => timer.ms)).toEqual([FREE_AFTER_MS, 10 * 60_000]);
    live[0]!.run();
    live[1]!.run();
    await Promise.resolve();
    expect(log).toEqual(["launch", "generate", "free", "kill"]);
  });

  it("does not start a second process for the next image", async () => {
    const { wrapped, log } = setup();
    await wrapped.generate(request);
    await wrapped.generate(request);
    expect(log.filter((entry) => entry === "launch")).toHaveLength(1);
  });

  it("leaves ComfyUI alone when the person started it and no command is set", async () => {
    const { wrapped, log, timers } = setup({ config: null });
    await wrapped.generate(request);
    expect(log).toEqual(["generate"]);
    expect(timers).toHaveLength(0);
  });

  it("stops what it started and reports a plain error when ComfyUI never answers", async () => {
    const { wrapped, log } = setup({ startsOnLaunch: false });
    await expect(wrapped.generate(request)).rejects.toThrow(/did not start in time/);
    expect(log).toEqual(["launch", "kill"]);
  });

  it("dispose stops only a process it started", async () => {
    const idle = setup({ config: null });
    await idle.wrapped.generate(request);
    idle.wrapped.dispose();
    expect(idle.log).not.toContain("kill");
    const started = setup();
    await started.wrapped.generate(request);
    started.wrapped.dispose();
    expect(started.log).toContain("kill");
  });
});
