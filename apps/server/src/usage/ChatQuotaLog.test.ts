// @effect-diagnostics nodeBuiltinImport:off - the fixture needs a real temp folder.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";

import { CHAT_QUOTA_RETENTION_MS, makeChatQuotaRecorder, readChatQuota } from "./ChatQuotaLog.ts";

const NOW = Date.parse("2026-11-13T03:00:00.000Z");
const R5 = "2026-11-13T06:00:00.000Z";
const reading = (at: number, threadId: string, u5: number) => ({
  at,
  threadId,
  fiveHour: { usedPercent: u5, resetsAt: R5 },
});

describe("chat quota log", () => {
  it.live("skips repeat readings, drops expired lines and attributes per chat", () =>
    Effect.gen(function* () {
      const dir = yield* Effect.acquireRelease(
        Effect.promise(() => NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "chat quota "))),
        (dir) => Effect.promise(() => NodeFSP.rm(dir, { recursive: true, force: true })),
      );
      const file = NodePath.join(dir, "chat-quota", "claudeAgent_justine.jsonl");
      yield* Effect.gen(function* () {
        const record = yield* makeChatQuotaRecorder(dir, "claudeAgent_justine", NOW);
        yield* record(reading(NOW - CHAT_QUOTA_RETENTION_MS - 1, "old", 1));
        yield* record(reading(NOW, "a", 10));
        yield* record(reading(NOW + 1, "a", 10));
        yield* record(reading(NOW + 2, "a", 30));
        const lines = (yield* Effect.promise(() => NodeFSP.readFile(file, "utf8"))).trim();
        expect(lines.split("\n")).toHaveLength(3);

        // A restart drops the expired line and keeps the rest.
        yield* makeChatQuotaRecorder(dir, "claudeAgent_justine", NOW + 3);
        const kept = (yield* Effect.promise(() => NodeFSP.readFile(file, "utf8"))).trim();
        expect(kept.split("\n")).toHaveLength(2);

        const report = yield* readChatQuota(dir, NOW - 1);
        expect(report.coverageStart).toBe(NOW);
        expect(report.chats).toEqual([
          expect.objectContaining({
            threadId: "a",
            providerInstanceId: "claudeAgent_justine",
            fiveHour: { points: 20, sharedPoints: 0 },
          }),
        ]);
      }).pipe(Effect.provide(NodeServices.layer));
    }).pipe(Effect.scoped),
  );

  it.live("returns an empty report when no readings exist", () =>
    Effect.gen(function* () {
      const report = yield* readChatQuota(NodePath.join(NodeOS.tmpdir(), "no chat quota here"), 0);
      expect(report).toEqual({ coverageStart: null, chats: [] });
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
