import type { ScribeHistoryItem } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  commandErrorMessage,
  dictateButton,
  engineErrorView,
  homeShortcuts,
  liveLine,
  relativeTimeLabel,
  rowMeta,
  shouldRetryHistory,
} from "./home.logic";

const NOW = Date.parse("2026-10-17T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("homeShortcuts", () => {
  it("lists hold, toggle and rewrite, with the engine rewrite default", () => {
    const hotkeys = { hold: ["Ctrl + Shift + T"], toggle: ["Mouse5"], cancel: ["Escape"] };
    expect(homeShortcuts(hotkeys)).toEqual([
      { label: "Hold to talk", bindings: ["Ctrl + Shift + T"] },
      { label: "Start and stop", bindings: ["Mouse5"] },
      { label: "Rewrite selected text", bindings: ["Ctrl + Shift + A"] },
    ]);
    expect(homeShortcuts({ ...hotkeys, rewrite: [] } as never)[2]?.bindings).toEqual([]);
  });
});

describe("liveLine", () => {
  it("shows live words, then the last result, and guide text in between", () => {
    expect(liveLine("listening", "hello", "")).toEqual({ text: "hello", hint: false });
    expect(liveLine("listening", "", "old")).toEqual({ text: "Listening…", hint: true });
    expect(liveLine("processing", "", "")).toEqual({ text: "Writing your text…", hint: true });
    expect(liveLine("ready", "", "Done.")).toEqual({ text: "Done.", hint: false });
    expect(liveLine(null, "", "")).toEqual({
      text: "Press Start or a shortcut, then speak.",
      hint: true,
    });
  });
});

describe("dictateButton", () => {
  it("disables when the engine is stopped or unknown", () => {
    expect(dictateButton(false, null)).toEqual({ label: "Start", action: "none", disabled: true });
    expect(dictateButton(null, "ready").disabled).toBe(true);
  });
  it("maps engine states", () => {
    expect(dictateButton(true, "ready")).toEqual({
      label: "Start",
      action: "start",
      disabled: false,
    });
    expect(dictateButton(true, null).action).toBe("start");
    expect(dictateButton(true, "listening")).toEqual({
      label: "Stop",
      action: "stop",
      disabled: false,
    });
    expect(dictateButton(true, "processing")).toEqual({
      label: "Processing",
      action: "none",
      disabled: true,
    });
  });
});

describe("commandErrorMessage", () => {
  it("maps known reasons", () => {
    expect(commandErrorMessage({ reason: "invalid_state" })).toBe(
      "Scribe is busy. Wait for it to finish, then try again.",
    );
    expect(commandErrorMessage({ reason: "offline" })).toBe(
      "Scribe engine is not running. Start it from the tray, or install it.",
    );
  });
  it("falls back for unknown input", () => {
    expect(commandErrorMessage({ reason: "zzz" })).toBe("Scribe could not do that. Try again.");
    expect(commandErrorMessage(null)).toBe("Scribe could not do that. Try again.");
    expect(commandErrorMessage(new Error("x"))).toBe("Scribe could not do that. Try again.");
  });
});

describe("engineErrorView", () => {
  it("offers a retry only for a failed take whose audio was saved", () => {
    expect(
      engineErrorView({ code: "stt_error", message: "Could not reach Groq. Retry it in Scribe." }),
    ).toEqual({ title: "Dictation failed", retry: true });
    expect(engineErrorView({ code: "stt_error", message: "Could not reach Groq." })).toEqual({
      title: "Dictation failed",
      retry: false,
    });
    expect(engineErrorView({ code: "mic_error", message: "No input device" })).toEqual({
      title: "Microphone problem",
      retry: false,
    });
  });
});

describe("relativeTimeLabel", () => {
  it("steps through units", () => {
    expect(relativeTimeLabel(ago(10_000), NOW)).toBe("Just now");
    expect(relativeTimeLabel(ago(5 * 60_000), NOW)).toBe("5 min ago");
    expect(relativeTimeLabel(ago(3 * 3_600_000), NOW)).toBe("3 h ago");
    expect(relativeTimeLabel(ago(2 * 86_400_000), NOW)).toBe("2 d ago");
  });
  it("handles bad and future dates", () => {
    expect(relativeTimeLabel("nope", NOW)).toBe("");
    expect(relativeTimeLabel(ago(-5000), NOW)).toBe("Just now");
  });
});

describe("rowMeta", () => {
  const item = { at: ago(120_000), app: "Code", words: 1 } as ScribeHistoryItem;
  it("joins time, app and words", () => {
    expect(rowMeta(item, NOW)).toBe("2 min ago · Code · 1 word");
    expect(rowMeta({ ...item, app: " ", words: 4 }, NOW)).toBe("2 min ago · 4 words");
  });
});

describe("shouldRetryHistory", () => {
  it("retries a failed read when the engine reconnects", () => {
    expect(shouldRetryHistory(false, true, true)).toBe(true);
    expect(shouldRetryHistory(null, true, true)).toBe(true);
  });

  it("does not retry without an error or without a reconnect", () => {
    expect(shouldRetryHistory(false, true, false)).toBe(false);
    expect(shouldRetryHistory(true, true, true)).toBe(false);
    expect(shouldRetryHistory(true, false, true)).toBe(false);
  });
});
