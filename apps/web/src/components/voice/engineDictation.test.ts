import { describe, expect, it } from "vite-plus/test";

import { stepEngineTake } from "./engineDictation";

describe("stepEngineTake", () => {
  it("ignores a stale transcript while the engine is still ready after the press", () => {
    expect(stepEngineTake("started", "ready", "old text")).toEqual({
      take: "started",
      insert: null,
    });
  });

  it("follows a take from started through listening to the text", () => {
    const listening = stepEngineTake("started", "listening", "");
    expect(listening).toEqual({ take: "listening", insert: null });
    expect(stepEngineTake(listening.take, "processing", "")).toEqual({
      take: "listening",
      insert: null,
    });
    expect(stepEngineTake("listening", "ready", "Hello there.")).toEqual({
      take: "idle",
      insert: "Hello there.",
    });
  });

  it("inserts nothing when the take was cancelled or empty", () => {
    expect(stepEngineTake("listening", "ready", "  ")).toEqual({ take: "idle", insert: null });
  });

  it("leaves a take started by a hotkey to the engine", () => {
    expect(stepEngineTake("idle", "ready", "pasted by the engine")).toEqual({
      take: "idle",
      insert: null,
    });
  });

  it("drops the take on a microphone error", () => {
    expect(stepEngineTake("started", "mic_error", "")).toEqual({ take: "idle", insert: null });
  });
});
