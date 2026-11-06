import type { ScribeHistoryItem, ScribeLiveEvent } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  INITIAL_SCRIBE_LIVE,
  SCRIBE_LIVE_LIMIT,
  engineStrip,
  mergeRecent,
  reduceScribeLive,
} from "./scribeLive.logic";

const item = (id: string): ScribeHistoryItem => ({
  id,
  at: "2026-10-15T01:00:03.000Z",
  mode: "hold",
  app: "code.exe",
  rawText: "hello",
  cleanedText: "Hello.",
  words: 1,
  metrics: { transcribeMs: 1, polishMs: 1, totalMs: 2 },
  pasted: true,
});

const fold = (events: ScribeLiveEvent[]) => events.reduce(reduceScribeLive, INITIAL_SCRIBE_LIVE);

describe("reduceScribeLive", () => {
  it("follows a full dictation", () => {
    const snapshot = fold([
      { type: "connection", connected: true, at: "t" },
      { type: "state", state: "listening", at: "t" },
      { type: "partial", text: "hel", at: "t" },
      { type: "state", state: "processing", at: "t" },
      { type: "state", state: "ready", at: "t" },
      { type: "history", item: item("a") },
    ]);
    expect(snapshot).toMatchObject({ connected: true, state: "ready", partial: "" });
    expect(snapshot.saved.map((saved) => saved.id)).toEqual(["a"]);
  });

  it("keeps the last transcript text until the next dictation starts", () => {
    const done = fold([
      { type: "state", state: "processing", at: "t" },
      {
        type: "transcript",
        text: "Hello there.",
        durationMs: 760,
        pasted: false,
        engine: "groq",
        at: "t",
      },
      { type: "state", state: "ready", at: "t" },
    ]);
    expect(done.lastTranscript).toBe("Hello there.");
    expect(
      reduceScribeLive(done, { type: "state", state: "listening", at: "t" }).lastTranscript,
    ).toBe("");
  });

  it("clears state when the link drops", () => {
    const snapshot = fold([
      { type: "connection", connected: true, at: "t" },
      { type: "state", state: "listening", at: "t" },
      { type: "connection", connected: false, at: "t" },
    ]);
    expect(snapshot).toMatchObject({ connected: false, state: null });
  });

  it("keeps the last error until the engine is ready again", () => {
    const failed = fold([
      { type: "state", state: "mic_error", at: "t" },
      { type: "error", code: "mic_error", message: "No input device", at: "t" },
    ]);
    expect(failed.lastError?.message).toBe("No input device");
    expect(
      reduceScribeLive(failed, { type: "state", state: "ready", at: "t" }).lastError,
    ).toBeNull();
  });

  it("keeps a failed take error after ready, until the next take starts", () => {
    const failed = fold([
      { type: "state", state: "processing", at: "t" },
      { type: "error", code: "stt_error", message: "No speech. Retry it in Scribe.", at: "t" },
      { type: "state", state: "ready", at: "t" },
    ]);
    expect(failed.lastError?.code).toBe("stt_error");
    expect(
      reduceScribeLive(failed, { type: "state", state: "listening", at: "t" }).lastError,
    ).toBeNull();
  });

  it("caps saved items and drops a repeated id", () => {
    const events: ScribeLiveEvent[] = Array.from({ length: SCRIBE_LIVE_LIMIT + 5 }, (_, i) => ({
      type: "history",
      item: item(String(i)),
    }));
    events.push({ type: "history", item: item("3") });
    const snapshot = fold(events);
    expect(snapshot.saved).toHaveLength(SCRIBE_LIVE_LIMIT);
    expect(snapshot.saved[0]?.id).toBe("3");
    expect(snapshot.saved.filter((saved) => saved.id === "3")).toHaveLength(1);
  });
});

describe("mergeRecent", () => {
  it("puts live saves first and drops duplicates", () => {
    const merged = mergeRecent([item("c"), item("b")], [item("b"), item("a")], 3);
    expect(merged.map((merged) => merged.id)).toEqual(["c", "b", "a"]);
  });
});

describe("engineStrip", () => {
  it("names each engine state in plain words", () => {
    expect(engineStrip(INITIAL_SCRIBE_LIVE).label).toBe("Connecting to Scribe");
    expect(engineStrip({ ...INITIAL_SCRIBE_LIVE, connected: false }).label).toBe(
      "Scribe is not running",
    );
    expect(engineStrip({ ...INITIAL_SCRIBE_LIVE, connected: false }, true).label).toBe(
      "Engine stopped",
    );
    expect(engineStrip({ ...INITIAL_SCRIBE_LIVE, connected: true, state: "mic_error" })).toEqual({
      label: "Microphone problem",
      tone: "warning",
    });
  });
});
