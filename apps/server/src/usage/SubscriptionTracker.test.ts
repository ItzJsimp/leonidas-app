// @effect-diagnostics nodeBuiltinImport:off - temporary fixture directories only.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { makeSubscriptionTracker } from "./SubscriptionTracker.ts";
import { UsageService } from "./UsageService.ts";
import { emptyTotals } from "./subscriptionTracking.ts";

const start = Date.parse("2026-10-11T00:00:00Z");
function provider(
  percent: number,
  minute = 0,
  email = "fixture@example.test",
  plan = "Pro",
): ServerProvider {
  const checkedAt = DateTime.formatIso(DateTime.makeUnsafe(start + minute * 60_000));
  return {
    instanceId: ProviderInstanceId.make("codex"),
    driver: ProviderDriverKind.make("codex"),
    status: "ready",
    enabled: true,
    installed: true,
    version: "fixture",
    auth: { status: "authenticated", email, label: plan },
    checkedAt,
    models: [],
    skills: [],
    slashCommands: [],
    usageLimits: {
      checkedAt,
      windows: [
        {
          id: "primary",
          kind: "session",
          label: "Session",
          usedPercent: percent,
          resetsAt: "2026-10-11T05:00:00Z",
        },
        {
          id: "secondary",
          kind: "weekly",
          label: "Weekly",
          usedPercent: percent,
          resetsAt: "2026-10-18T00:00:00Z",
        },
      ],
    },
  };
}
const capacity = (p: ServerProvider, index = 0) =>
  p.usageLimits?.windows[index]?.tokenEstimate?.capacityTokens;

describe("server subscription tracking", () => {
  it.live("persists calibration across restart and keeps sparse weekly observations", () =>
    Effect.gen(function* () {
      const dir = yield* Effect.acquireRelease(
        Effect.promise(() =>
          NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "subscription fixture ")),
        ),
        (dir) => Effect.promise(() => NodeFSP.rm(dir, { recursive: true, force: true })),
      );
      yield* Effect.gen(function* () {
        const track = yield* makeSubscriptionTracker(dir);
        expect(capacity(yield* track(provider(20)))).toBeUndefined();
        expect(capacity(yield* track(provider(30, 1)))).toBe(500_000);
        const restart = yield* makeSubscriptionTracker(dir);
        const sparse = provider(40, 2);
        yield* restart({
          ...sparse,
          usageLimits: { ...sparse.usageLimits!, windows: sparse.usageLimits!.windows.slice(0, 1) },
        });
        const next = yield* restart(provider(50, 3));
        expect(capacity(next)).toBe(500_000);
        expect(capacity(next, 1)).toBe(500_000);
      }).pipe(
        Effect.provide(NodeServices.layer),
        Effect.provideService(
          UsageService,
          UsageService.of({
            readSummary: () => Effect.die("unused"),
            refreshRates: Effect.die("unused"),
            readSubscriptionTokens: (_id, since, until) =>
              Effect.succeed({
                sourceKey: "fixture source",
                totals: { ...emptyTotals(), outputTokens: ((until - since) / 60_000) * 50_000 },
              }),
          }),
        ),
      );
      const ledger = yield* Effect.promise(() =>
        NodeFSP.readFile(NodePath.join(dir, "subscription-calibration.json"), "utf8"),
      );
      expect(ledger).not.toContain("fixture@example.test");
      const events = (yield* Effect.promise(() =>
        NodeFSP.readFile(NodePath.join(dir, "subscription-observations.jsonl"), "utf8"),
      ))
        .trim()
        .split("\n");
      expect(events).toHaveLength(4);
    }).pipe(Effect.scoped),
  );
  it.live("enriches windows with projectedUsedPercentAtReset from historical observations", () =>
    Effect.gen(function* () {
      const dir = yield* Effect.acquireRelease(
        Effect.promise(() =>
          NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "subscription forecast fixture ")),
        ),
        (dir) => Effect.promise(() => NodeFSP.rm(dir, { recursive: true, force: true })),
      );
      yield* Effect.gen(function* () {
        const track = yield* makeSubscriptionTracker(dir);
        // First observation at hour 3
        yield* track(provider(70, 180));
        // Second observation at hour 3.5 showing calm burn (70.5%)
        yield* track(provider(70.5, 210));
        // Third observation at hour 4 (71% with 1 hour left until reset)
        const updated = yield* track(provider(71, 240));
        const sessionWindow = updated.usageLimits?.windows[0];
        expect(sessionWindow?.projectedUsedPercentAtReset).toBeDefined();
        // With calm burn, projected is well under 100
        expect(sessionWindow?.projectedUsedPercentAtReset).toBeLessThan(95);
      }).pipe(
        Effect.provide(NodeServices.layer),
        Effect.provideService(
          UsageService,
          UsageService.of({
            readSummary: () => Effect.die("unused"),
            refreshRates: Effect.die("unused"),
            readSubscriptionTokens: () =>
              Effect.succeed({
                sourceKey: "fixture source",
                totals: { ...emptyTotals(), outputTokens: 5_000 },
              }),
          }),
        ),
      );
    }).pipe(Effect.scoped),
  );

  it.live("isolates account and plan changes and restarts on missing token coverage", () =>
    Effect.gen(function* () {
      const dir = yield* Effect.acquireRelease(
        Effect.promise(() =>
          NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "subscription fixture ")),
        ),
        (dir) => Effect.promise(() => NodeFSP.rm(dir, { recursive: true, force: true })),
      );
      let missing = false;
      yield* Effect.gen(function* () {
        const track = yield* makeSubscriptionTracker(dir);
        yield* track(provider(20));
        expect(capacity(yield* track(provider(30, 1)))).toBe(500_000);
        expect(capacity(yield* track(provider(40, 2, "other@example.test")))).toBeUndefined();
        expect(
          capacity(yield* track(provider(50, 3, "other@example.test", "Plus"))),
        ).toBeUndefined();
        expect(capacity(yield* track(provider(60, 4, "other@example.test", "Plus")))).toBe(500_000);
        missing = true;
        const gap = yield* track(provider(70, 5, "other@example.test", "Plus"));
        expect(capacity(gap)).toBeUndefined();
        expect(gap.usageLimits?.windows[0]?.tokenEstimate?.status).toBe("unavailable");
      }).pipe(
        Effect.provide(NodeServices.layer),
        Effect.provideService(
          UsageService,
          UsageService.of({
            readSummary: () => Effect.die("unused"),
            refreshRates: Effect.die("unused"),
            readSubscriptionTokens: () =>
              Effect.succeed(
                missing
                  ? null
                  : {
                      sourceKey: "fixture source",
                      totals: { ...emptyTotals(), outputTokens: 50_000 },
                    },
              ),
          }),
        ),
      );
    }).pipe(Effect.scoped),
  );

  it.live("compacts oversized observation logs on startup and keeps recent history", () =>
    Effect.gen(function* () {
      const dir = yield* Effect.acquireRelease(
        Effect.promise(() =>
          NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "subscription compact fixture ")),
        ),
        (dir) => Effect.promise(() => NodeFSP.rm(dir, { recursive: true, force: true })),
      );
      const obsPath = NodePath.join(dir, "subscription-observations.jsonl");
      const mockUsage = UsageService.of({
        readSummary: () => Effect.die("unused"),
        refreshRates: Effect.die("unused"),
        readSubscriptionTokens: (_id, since, until) =>
          Effect.succeed({
            sourceKey: "fixture source",
            totals: { ...emptyTotals(), outputTokens: ((until - since) / 60_000) * 50_000 },
          }),
      });
      yield* Effect.gen(function* () {
        const track = yield* makeSubscriptionTracker(dir);
        yield* track(provider(20, 0));
        yield* track(provider(30, 1));
        // Prepend old entries so the file exceeds maxObservationBytes before restart.
        const seedLines = Array.from({ length: 30 }, (_, idx) =>
          JSON.stringify({
            instanceId: "codex",
            accountKey: "old_account_key",
            checkedAt: DateTime.formatIso(DateTime.makeUnsafe(start - (idx + 1) * 60_000)),
            windows: [{ id: "primary", usedPercent: 11 + idx, resetsAt: "2026-10-11T05:00:00Z" }],
          }),
        );
        const existing = yield* Effect.promise(() => NodeFSP.readFile(obsPath, "utf8"));
        yield* Effect.promise(() =>
          NodeFSP.writeFile(obsPath, `${seedLines.join("\n")}\n${existing}`, "utf8"),
        );
        const sizeBefore = (yield* Effect.promise(() => NodeFSP.stat(obsPath))).size;
        expect(sizeBefore).toBeGreaterThan(2_000);

        const restart = yield* makeSubscriptionTracker(dir, { maxObservationBytes: 2_000 });
        const sizeAfter = (yield* Effect.promise(() => NodeFSP.stat(obsPath))).size;
        expect(sizeAfter).toBeLessThanOrEqual(1_500);

        const next = yield* restart(provider(40, 2));
        expect(capacity(next)).toBe(500_000);
      }).pipe(Effect.provide(NodeServices.layer), Effect.provideService(UsageService, mockUsage));
    }).pipe(Effect.scoped),
  );

  it.live(
    "filters OpenRouter summary reads, deduplicates window token reads, and keeps calibration on timeout",
    () =>
      Effect.gen(function* () {
        const dir = yield* Effect.acquireRelease(
          Effect.promise(() =>
            NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "subscription timeout fixture ")),
          ),
          (dir) => Effect.promise(() => NodeFSP.rm(dir, { recursive: true, force: true })),
        );
        const summaryCalls: Array<{ readonly onlyProvider: string | undefined }> = [];
        let tokenReadCalls = 0;
        let stallTokenReads = false;

        yield* Effect.gen(function* () {
          const track = yield* makeSubscriptionTracker(dir, { usageReadTimeoutMs: 25 });
          const openRouter: ServerProvider = {
            ...provider(25, 10),
            instanceId: ProviderInstanceId.make("openrouter"),
            driver: ProviderDriverKind.make("openrouter"),
            usageLimits: {
              checkedAt: DateTime.formatIso(DateTime.makeUnsafe(start + 10 * 60_000)),
              windows: [
                { id: "openrouter_credits", kind: "other", label: "Credits", usedPercent: 25 },
              ],
            },
          };
          const openRouterResult = yield* track(openRouter);
          expect(summaryCalls).toEqual([{ onlyProvider: "openrouter" }]);
          expect(openRouterResult.usageLimits?.windows[0]?.label).toContain("42K tokens (30d)");

          yield* track(provider(20, 0));
          expect(capacity(yield* track(provider(30, 1)))).toBe(500_000);
          // Primary and secondary share the same previous checkedAt, so reader runs once.
          expect(tokenReadCalls).toBe(1);

          stallTokenReads = true;
          const stalled = yield* track(provider(40, 2));
          expect(capacity(stalled)).toBe(500_000);
          expect(stalled.usageLimits?.windows[0]?.tokenEstimate?.status).toBe("estimated");
        }).pipe(
          Effect.provide(NodeServices.layer),
          Effect.provideService(
            UsageService,
            UsageService.of({
              readSummary: (input, options) => {
                summaryCalls.push({ onlyProvider: options?.onlyProvider });
                return Effect.succeed({
                  contractVersion: 2,
                  readAt: "2026-10-11T00:10:00Z",
                  timeZone: input.timeZone,
                  sinceDay: input.sinceDay,
                  untilDay: input.untilDay,
                  buckets: [
                    {
                      day: input.untilDay,
                      provider: "openrouter",
                      model: "openrouter/test",
                      sourcePath: "/tmp/openrouter",
                      totals: { ...emptyTotals(), outputTokens: 42_000 },
                      costUsd: 0,
                      cacheSavingsUsd: 0,
                      costSource: "unpriced",
                      records: 1,
                      unpricedRecords: 1,
                      sessions: 1,
                    },
                  ],
                  sources: [],
                  pricing: {
                    status: "unavailable",
                    source: "fixture",
                    fetchedAt: null,
                    knownModels: 0,
                  },
                  scanDurationMs: 1,
                });
              },
              refreshRates: Effect.die("unused"),
              readSubscriptionTokens: () => {
                tokenReadCalls += 1;
                if (stallTokenReads) return Effect.never;
                return Effect.succeed({
                  sourceKey: "fixture source",
                  totals: { ...emptyTotals(), outputTokens: 50_000 },
                });
              },
            }),
          ),
        );
      }).pipe(Effect.scoped),
  );
});
