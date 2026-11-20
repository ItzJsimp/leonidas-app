import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { countAccountLoad, resolveAccountKey } from "./activeAgentCounts.ts";

const provider = (instanceId: string, extra: Record<string, unknown> = {}) =>
  ({ instanceId, driver: "claudeAgent", ...extra }) as never;
const NOW = Date.parse("2026-11-19T12:00:00.000Z");
const minutesAgo = (minutes: number) =>
  DateTime.formatIso(DateTime.makeUnsafe(NOW - minutes * 60_000));
const thread = (
  instanceId: string,
  status: string,
  extra: {
    archivedAt?: string | null;
    subagent?: boolean;
    lastActivityAt?: string | null;
    updatedAt?: string;
  } = {},
) =>
  ({
    modelSelection: { instanceId },
    runtime: { status, providerInstanceId: instanceId },
    archivedAt: extra.archivedAt ?? null,
    lastActivityAt: extra.lastActivityAt === undefined ? minutesAgo(5) : extra.lastActivityAt,
    updatedAt: extra.updatedAt ?? minutesAgo(5),
    lineage: { relationshipToParent: extra.subagent ? "subagent" : null },
  }) as never;

describe("countAccountLoad", () => {
  it("counts every active chat and marks which ones run", () => {
    const load = countAccountLoad({
      nowMs: NOW,
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
      nowMs: NOW,
      providers: [provider("a")],
      threads: [
        thread("a", "idle"),
        thread("a", "idle", { subagent: true }),
        thread("a", "running", { subagent: true }),
      ],
    });
    expect(load.get(resolveAccountKey(provider("a")))).toEqual({ chats: 2, running: 1 });
  });

  it("drops a chat whose last work was an hour ago or more", () => {
    const load = countAccountLoad({
      nowMs: NOW,
      providers: [provider("a")],
      threads: [
        thread("a", "idle", { lastActivityAt: minutesAgo(59) }),
        thread("a", "idle", { lastActivityAt: minutesAgo(60) }),
        thread("a", "completed", { lastActivityAt: minutesAgo(600) }),
        thread("a", "waiting", { lastActivityAt: minutesAgo(600) }),
      ],
    });
    expect(load.get(resolveAccountKey(provider("a")))).toEqual({ chats: 1, running: 0 });
  });

  it("keeps an agent that is still running after an hour without a tool call", () => {
    const load = countAccountLoad({
      nowMs: NOW,
      providers: [provider("a")],
      threads: [thread("a", "running", { lastActivityAt: minutesAgo(180) })],
    });
    expect(load.get(resolveAccountKey(provider("a")))).toEqual({ chats: 1, running: 1 });
  });

  it("falls back to the last update when the server sends no activity time", () => {
    const load = countAccountLoad({
      nowMs: NOW,
      providers: [provider("a")],
      threads: [
        thread("a", "idle", { lastActivityAt: null, updatedAt: minutesAgo(10) }),
        thread("a", "idle", { lastActivityAt: null, updatedAt: minutesAgo(90) }),
      ],
    });
    expect(load.get(resolveAccountKey(provider("a")))).toEqual({ chats: 1, running: 0 });
  });

  it("merges instances that share an email on the same driver", () => {
    const auth = { email: "Me@x.com" };
    const providers = [provider("a", { auth }), provider("b", { auth })];
    const load = countAccountLoad({
      nowMs: NOW,
      providers,
      threads: [thread("a", "running"), thread("b", "idle")],
    });
    expect([...load.values()]).toEqual([{ chats: 2, running: 1 }]);
  });

  it("keeps separate accounts apart and handles unknown instances", () => {
    const load = countAccountLoad({
      nowMs: NOW,
      providers: [
        provider("a", { auth: { email: "a@x" } }),
        provider("b", { auth: { email: "b@x" } }),
      ],
      threads: [thread("a", "running"), thread("b", "idle"), thread("zz", "idle")],
    });
    expect(load.size).toBe(3);
  });
});
