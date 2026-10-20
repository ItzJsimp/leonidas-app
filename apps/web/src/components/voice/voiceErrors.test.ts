import { describe, expect, it } from "vite-plus/test";

import { describeVoiceFailure } from "./voiceErrors";

describe("describeVoiceFailure", () => {
  it("says there is no microphone, and offers typing", () => {
    const text = describeVoiceFailure(
      new DOMException("Requested device not found", "NotFoundError"),
    );
    expect(text).toContain("No microphone found");
    expect(text).toContain("type");
  });

  it("explains a blocked microphone without browser jargon", () => {
    const text = describeVoiceFailure(new DOMException("Permission denied", "NotAllowedError"));
    expect(text).toContain("cannot use the microphone");
    expect(text).not.toContain("Permission denied");
  });

  it("tells the user when another app holds the microphone", () => {
    expect(describeVoiceFailure(new DOMException("x", "NotReadableError"))).toContain(
      "Another app",
    );
  });

  it("keeps our own plain messages and falls back for unknown values", () => {
    expect(describeVoiceFailure(new Error("Voice status is unavailable. Reconnect."))).toBe(
      "Voice status is unavailable. Reconnect.",
    );
    expect(describeVoiceFailure("boom")).toBe(
      "Voice failed. Check microphone access and try again.",
    );
  });
});
