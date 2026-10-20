import type { ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { shouldShowNoAiBanner } from "./noAiBanner.logic";

const provider = (patch: Partial<ServerProvider>): ServerProvider =>
  ({
    enabled: true,
    installed: true,
    status: "ready",
    auth: { status: "authenticated" },
    models: [],
    slashCommands: [],
    skills: [],
    checkedAt: "2026-10-19T00:00:00.000Z",
    ...patch,
  }) as unknown as ServerProvider;

describe("shouldShowNoAiBanner", () => {
  it("stays hidden before providers load", () => {
    expect(shouldShowNoAiBanner([], 0)).toBe(false);
  });
  it("stays hidden when one account is ready", () => {
    const providers = [provider({ installed: false, status: "error" }), provider({})];
    expect(shouldShowNoAiBanner(providers, 0)).toBe(false);
  });
  it("shows when every enabled account is signed out or missing", () => {
    const providers = [
      provider({ auth: { status: "unauthenticated" } as ServerProvider["auth"] }),
      provider({ installed: false, status: "error" }),
      provider({ enabled: false }),
    ];
    expect(shouldShowNoAiBanner(providers, 0)).toBe(true);
  });
});
