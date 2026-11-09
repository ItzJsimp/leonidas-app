import { describe, expect, it, vi } from "@effect/vitest";

import { readVoiceLimit, setVoiceLimit } from "./voiceLimit.ts";

describe("voice daemon limit", () => {
  it("reads a fractional setting and saves zero without changing other settings", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ speak_rate_limit_seconds: 1.5, voice: "kept" })),
      )
      .mockResolvedValue(new Response("{}"));
    expect(await readVoiceLimit(request)).toBe(1.5);
    await setVoiceLimit(0, request);
    expect(request.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ speak_rate_limit_seconds: 0 }));
    await setVoiceLimit(2.75, request);
    expect(request.mock.calls[2]?.[1]?.body).toBe(
      JSON.stringify({ speak_rate_limit_seconds: 2.75 }),
    );
  });

  it("uses 600 seconds when unset and refuses invalid values without a request", async () => {
    const request = vi.fn().mockResolvedValue(new Response("{}"));
    expect(await readVoiceLimit(request)).toBe(600);
    request.mockClear();
    for (const value of [-1, 86401, NaN])
      await expect(setVoiceLimit(value, request)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});
