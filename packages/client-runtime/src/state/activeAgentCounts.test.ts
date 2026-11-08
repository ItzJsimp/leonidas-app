import { describe, expect, it } from "vite-plus/test";

import { countAccountLoad, resolveAccountKey } from "./activeAgentCounts.ts";

const provider = (instanceId: string, extra: Record<string, unknown> = {}) =>
  ({ instanceId, driver: "claudeAgent", ...extra }) as never;
const thread = (
  instanceId: string,
  status: string,
  extra: { archivedAt?: string | null; subagent?: boolean } = {},
) =>
  ({
    modelSelection: { instanceId },
    runtime: { status, providerInstanceId: instanceId },
    archivedAt: extra.archivedAt ?? null,
    lineage: { relationshipToParent: extra.subagent ? "subagent" : null },
  }) as never;

describe("countAccountLoad", () => {
  it("counts every open chat and marks which ones run", () => {
    const load = countAccountLoad({
      providers: [provider("a")],
      threads: [
        thread("a", "running"),
        thread("a", "waiting"),
        thread("a", "idle"),
        thread("a", "queued"),
        thread("a", "completed"),
        thread("a", "running", { archivedAt: "2026-01-01" }),
      ],
    });
    expect(load.get(resolveAccountKey(provider("a")))).toEqual({ chats: 5, running: 2 });
  });

  it("counts a subagent only while it runs", () => {
    const load = countAccountLoad({
      providers: [provider("a")],
      threads: [
        thread("a", "idle"),
        thread("a", "idle", { subagent: true }),
        thread("a", "running", { subagent: true }),
      ],
    });
    expect(load.get(resolveAccountKey(provider("a")))).toEqual({ chats: 2, running: 1 });
  });

  it("merges instances that share an email on the same driver", () => {
    const auth = { email: "Me@x.com" };
    const providers = [provider("a", { auth }), provider("b", { auth })];
    const load = countAccountLoad({
      providers,
      threads: [thread("a", "running"), thread("b", "idle")],
    });
    expect([...load.values()]).toEqual([{ chats: 2, running: 1 }]);
  });

  it("keeps separate accounts apart and handles unknown instances", () => {
    const load = countAccountLoad({
      providers: [
        provider("a", { auth: { email: "a@x" } }),
        provider("b", { auth: { email: "b@x" } }),
      ],
      threads: [thread("a", "running"), thread("b", "idle"), thread("zz", "idle")],
    });
    expect(load.size).toBe(3);
  });
});
