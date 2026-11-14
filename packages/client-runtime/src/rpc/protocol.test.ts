import { describe, expect, it } from "@effect/vitest";

import { PING_TIMEOUT, pingTimeoutForSocketUrl } from "./protocol.ts";

describe("pingTimeoutForSocketUrl", () => {
  it("allows a long freeze on this computer", () => {
    expect(pingTimeoutForSocketUrl("ws://127.0.0.1:3773/ws")).toBe("90 seconds");
    expect(pingTimeoutForSocketUrl("ws://localhost:3773/ws")).toBe("90 seconds");
  });

  it("keeps the short limit for remote hosts and bad URLs", () => {
    expect(pingTimeoutForSocketUrl("wss://example.com/ws")).toBe(PING_TIMEOUT);
    expect(pingTimeoutForSocketUrl("not a url")).toBe(PING_TIMEOUT);
  });
});
