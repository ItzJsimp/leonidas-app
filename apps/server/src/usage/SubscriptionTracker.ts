// @effect-diagnostics nodeBuiltinImport:off - hashes opaque account identities without persisting email addresses.
import * as NodeCrypto from "node:crypto";
import type { UsageTokenTotals } from "@t3tools/contracts";
import { UsageDay, type ServerProvider } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import { writeFileStringAtomically } from "@t3tools/shared/atomicWrite";
import {
  forecastWindowUsedPercentAtReset,
  type UsageObservationPoint,
} from "@t3tools/shared/usageForecast";
import { UsageService } from "./UsageService.ts";
import { SubscriptionLedger, advanceSubscriptionWindow } from "./subscriptionTracking.ts";

const OPENROUTER_TOKEN_CACHE_MS = 60_000;
const MAX_HISTORY_POINTS = 500;
const DEFAULT_MAX_OBSERVATION_BYTES = 4 * 1024 * 1024;
const COMPACT_TARGET_RATIO = 0.75;
const DEFAULT_USAGE_READ_TIMEOUT_MS = 8_000;

interface ParsedObservationLine {
  readonly accountKey: string;
  readonly checkedAtMs: number;
  readonly windows: ReadonlyArray<{
    readonly id: string;
    readonly usedPercent: number;
    readonly resetsAt?: string;
  }>;
}

/** Parse only the fields forecasting needs, avoiding schema decoding across thousands of lines. */
function parseObservationLine(trimmed: string): ParsedObservationLine | null {
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.accountKey !== "string" || typeof record.checkedAt !== "string") return null;
  const checkedAtMs = Date.parse(record.checkedAt);
  if (!Number.isFinite(checkedAtMs) || !Array.isArray(record.windows)) return null;
  const windows: Array<{
    readonly id: string;
    readonly usedPercent: number;
    readonly resetsAt?: string;
  }> = [];
  for (const entry of record.windows) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const win = entry as Record<string, unknown>;
    if (
      typeof win.id !== "string" ||
      typeof win.usedPercent !== "number" ||
      !Number.isFinite(win.usedPercent)
    ) {
      continue;
    }
    const resetsAt = typeof win.resetsAt === "string" ? win.resetsAt : undefined;
    windows.push({
      id: win.id,
      usedPercent: win.usedPercent,
      ...(resetsAt !== undefined ? { resetsAt } : {}),
    });
  }
  return { accountKey: record.accountKey, checkedAtMs, windows };
}

/** Keep the newest observation lines per account within the target byte budget. */
function compactObservationText(
  text: string,
  maxPointsPerAccount: number,
  targetBytes: number,
): { readonly content: string; readonly bytes: number } {
  const lines = text.split("\n");
  const counts = new Map<string, number>();
  const kept: string[] = [];
  let keptBytes = 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const trimmed = lines[i]!.trim();
    if (!trimmed) continue;
    const parsed = parseObservationLine(trimmed);
    if (!parsed) continue;
    const count = counts.get(parsed.accountKey) ?? 0;
    if (count >= maxPointsPerAccount) continue;
    const lineBytes = Buffer.byteLength(trimmed, "utf8") + 1;
    if (kept.length > 0 && keptBytes + lineBytes > targetBytes) break;
    kept.push(trimmed);
    counts.set(parsed.accountKey, count + 1);
    keptBytes += lineBytes;
  }
  kept.reverse();
  return {
    content: kept.length > 0 ? `${kept.join("\n")}\n` : "",
    bytes: keptBytes,
  };
}

const readObservationTail = Effect.fn("SubscriptionTracker.readObservationTail")(function* (
  fs: FileSystem.FileSystem,
  observationsPath: string,
  maxBytes: number,
) {
  const info = yield* fs.stat(observationsPath).pipe(Effect.orElseSucceed(() => null));
  if (!info) return { text: "", totalBytes: 0, truncated: false } as const;
  const size = Number(info.size);
  if (!Number.isFinite(size) || size <= 0) {
    return { text: "", totalBytes: 0, truncated: false } as const;
  }
  if (size <= maxBytes) {
    const text = yield* fs.readFileString(observationsPath).pipe(Effect.orElseSucceed(() => ""));
    return { text, totalBytes: size, truncated: false } as const;
  }
  const start = Math.max(0, size - maxBytes);
  const bytes = yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* fs.open(observationsPath, { flag: "r" });
      yield* handle.seek(BigInt(start), "start");
      return yield* handle.readAlloc(size - start);
    }),
  ).pipe(Effect.orElseSucceed(() => Option.none<Uint8Array>()));
  if (Option.isNone(bytes)) {
    return { text: "", totalBytes: size, truncated: true } as const;
  }
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes.value);
  // Drop the first line when seeking mid-file because it is likely partial.
  const firstNewline = start > 0 ? decoded.indexOf("\n") : -1;
  const text = firstNewline >= 0 ? decoded.slice(firstNewline + 1) : decoded;
  return { text, totalBytes: size, truncated: true } as const;
});

const formatTokens = (count: number): string =>
  count >= 1_000_000
    ? `${(count / 1_000_000).toFixed(1)}M`
    : count >= 1_000
      ? `${Math.round(count / 1_000)}K`
      : String(count);

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const encodeLedger = Schema.encodeSync(Schema.fromJsonString(SubscriptionLedger));

/** Persisted server-owned calibration, shared by all clients and agent snapshots. */
export const makeSubscriptionTracker = Effect.fn("makeSubscriptionTracker")(function* (
  cacheDir: string,
  options?: {
    readonly maxObservationBytes?: number;
    readonly usageReadTimeoutMs?: number;
  },
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const maxObservationBytes = Math.max(
    1,
    options?.maxObservationBytes ?? DEFAULT_MAX_OBSERVATION_BYTES,
  );
  const compactTargetBytes = Math.max(1, Math.floor(maxObservationBytes * COMPACT_TARGET_RATIO));
  const usageReadTimeoutMs = Math.max(
    1,
    options?.usageReadTimeoutMs ?? DEFAULT_USAGE_READ_TIMEOUT_MS,
  );
  const usage = yield* Effect.serviceOption(UsageService);
  const reader = Option.isSome(usage) ? usage.value.readSubscriptionTokens : undefined;
  const mutex = yield* Semaphore.make(1);
  const ledgerPath = path.join(cacheDir, "subscription-calibration.json");
  const raw = yield* fs.readFileString(ledgerPath).pipe(Effect.orElseSucceed(() => "{}"));
  const decode = Schema.decodeUnknownOption(Schema.fromJsonString(SubscriptionLedger));
  let ledger: SubscriptionLedger = Option.getOrElse(decode(raw), () => ({}));

  const observationsPath = path.join(cacheDir, "subscription-observations.jsonl");
  const tail = yield* readObservationTail(fs, observationsPath, maxObservationBytes);
  const historyByAccountAndWindow = new Map<string, UsageObservationPoint[]>();
  for (const line of tail.text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = parseObservationLine(trimmed);
    if (!parsed) continue;
    for (const win of parsed.windows) {
      const key = parsed.accountKey + ":" + win.id;
      let list = historyByAccountAndWindow.get(key);
      if (!list) {
        list = [];
        historyByAccountAndWindow.set(key, list);
      }
      list.push({
        checkedAt: parsed.checkedAtMs,
        usedPercent: win.usedPercent,
        resetsAt: win.resetsAt,
      });
      if (list.length > MAX_HISTORY_POINTS) {
        list.shift();
      }
    }
  }

  let observationsBytes = tail.totalBytes;
  const writeCompactedObservations = Effect.fn("SubscriptionTracker.writeCompactedObservations")(
    function* (sourceText: string) {
      const compacted = compactObservationText(sourceText, MAX_HISTORY_POINTS, compactTargetBytes);
      yield* fs.makeDirectory(cacheDir, { recursive: true });
      yield* writeFileStringAtomically({
        filePath: observationsPath,
        contents: compacted.content,
      }).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
      );
      observationsBytes = compacted.bytes;
    },
  );

  if (tail.truncated) {
    yield* writeCompactedObservations(tail.text).pipe(Effect.ignoreCause);
  }

  const readSummary = Option.isSome(usage) ? usage.value.readSummary : undefined;
  let tokenCache: { readonly at: number; readonly tokens: number } | undefined;
  /** OpenRouter has no windows to calibrate, so its card gets a plain recent token count. */
  const withOpenRouterTokens = (provider: ServerProvider): Effect.Effect<ServerProvider> => {
    const limits = provider.usageLimits;
    if (!readSummary || provider.driver !== "openrouter" || !limits || limits.unavailable)
      return Effect.succeed(provider);
    const tokens = Effect.flatMap(DateTime.now, (nowTime) => {
      const now = DateTime.toEpochMillis(nowTime);
      if (tokenCache && now - tokenCache.at < OPENROUTER_TOKEN_CACHE_MS)
        return Effect.succeed(tokenCache.tokens);
      const day = (epochMs: number) =>
        UsageDay.make(DateTime.formatIso(DateTime.makeUnsafe(epochMs)).slice(0, 10));
      return readSummary(
        {
          sinceDay: day(now - 29 * 86_400_000),
          untilDay: day(now),
          timeZone: "UTC",
        },
        { onlyProvider: "openrouter" },
      ).pipe(
        Effect.map((summary) =>
          summary.buckets.reduce(
            (sum, { provider: source, totals }) =>
              source === "openrouter"
                ? sum +
                  totals.uncachedInputTokens +
                  totals.cachedInputTokens +
                  totals.cacheCreationTokens +
                  totals.outputTokens
                : sum,
            0,
          ),
        ),
        Effect.tap((total) =>
          Effect.sync(() => {
            tokenCache = { at: now, tokens: total };
          }),
        ),
        Effect.timeoutOption(usageReadTimeoutMs),
        Effect.flatMap(Effect.fromOption),
      );
    });
    return tokens.pipe(
      Effect.map((total) => ({
        ...provider,
        usageLimits: {
          ...limits,
          windows: limits.windows.map((window) =>
            window.id === "openrouter_credits"
              ? { ...window, label: `${window.label} · ${formatTokens(total)} tokens (30d)` }
              : window,
          ),
        },
      })),
      Effect.orElseSucceed(() => provider),
    );
  };

  return (provider: ServerProvider) =>
    withOpenRouterTokens(provider).pipe(Effect.flatMap(trackWindows));

  function trackWindows(provider: ServerProvider) {
    return mutex.withPermit(
      Effect.gen(function* () {
        const limits = provider.usageLimits;
        if (!reader || !limits || limits.unavailable || limits.windows.length === 0)
          return provider;
        const identity = provider.auth.email?.trim().toLowerCase() || limits.credentialFingerprint;
        const accountKey = NodeCrypto.createHash("sha256")
          .update(encodeJson([provider.driver, identity, provider.auth.label]))
          .digest("hex");
        const saved =
          identity && ledger[provider.instanceId]?.accountKey === accountKey
            ? ledger[provider.instanceId]
            : undefined;
        const at = Date.parse(limits.checkedAt);
        let sourceKey = saved?.sourceKey ?? "";
        let windows = { ...saved?.windows };
        let sourceChanged = false;
        const observationsBySince = new Map<
          number,
          Option.Option<{ sourceKey: string; totals: UsageTokenTotals } | null>
        >();
        const readTokensForWindow = Effect.fn("SubscriptionTracker.readTokensForWindow")(function* (
          since: number,
        ) {
          if (observationsBySince.has(since)) return observationsBySince.get(since)!;
          const timed = yield* reader(provider.instanceId, since, at).pipe(
            Effect.orElseSucceed(() => null),
            Effect.timeoutOption(usageReadTimeoutMs),
          );
          observationsBySince.set(since, timed);
          return timed;
        });
        const enriched = yield* Effect.forEach(limits.windows, (window) =>
          Effect.gen(function* () {
            let previous = saved?.windows[window.id];
            let timedOut = false;
            let observation: { sourceKey: string; totals: UsageTokenTotals } | null = null;
            if (identity && previous && at > previous.checkedAt) {
              const timed = yield* readTokensForWindow(previous.checkedAt);
              if (Option.isNone(timed)) {
                // Keep prior calibration intact instead of resetting samples when a cold scan stalls.
                timedOut = true;
              } else {
                observation = timed.value;
              }
            }
            if (observation) {
              const nextSource = NodeCrypto.createHash("sha256")
                .update(observation.sourceKey)
                .digest("hex");
              if (saved?.sourceKey && saved.sourceKey !== nextSource) {
                previous = undefined;
                if (!sourceChanged) windows = {};
                sourceChanged = true;
              }
              sourceKey = nextSource;
            }
            const result = advanceSubscriptionWindow(
              previous,
              window,
              timedOut && previous ? previous.checkedAt : at,
              observation?.totals ?? null,
            );
            windows[window.id] = result.state;
            const historyKey = accountKey + ":" + window.id;
            const history = historyByAccountAndWindow.get(historyKey);
            const forecast = forecastWindowUsedPercentAtReset(window, at, history);
            const projectedUsedPercentAtReset =
              forecast !== null ? Math.round(forecast * 10) / 10 : undefined;
            let historyList = historyByAccountAndWindow.get(historyKey);
            if (!historyList) {
              historyList = [];
              historyByAccountAndWindow.set(historyKey, historyList);
            }
            historyList.push({
              checkedAt: at,
              usedPercent: window.usedPercent,
              resetsAt: window.resetsAt,
            });
            if (historyList.length > MAX_HISTORY_POINTS) {
              historyList.shift();
            }
            return {
              ...window,
              ...(projectedUsedPercentAtReset !== undefined ? { projectedUsedPercentAtReset } : {}),
              tokenEstimate: !identity
                ? {
                    ...result.estimate,
                    status: "unavailable" as const,
                    message: "An account identity is required to attribute tokens.",
                  }
                : result.estimate,
            };
          }),
        );
        const next = { ...ledger, [provider.instanceId]: { accountKey, sourceKey, windows } };
        if (encodeJson(next) !== encodeJson(ledger)) {
          yield* fs.makeDirectory(cacheDir, { recursive: true });
          yield* writeFileStringAtomically({
            filePath: ledgerPath,
            contents: encodeLedger(next),
          }).pipe(
            Effect.provideService(FileSystem.FileSystem, fs),
            Effect.provideService(Path.Path, path),
          );
          ledger = next;
          const appendedLine =
            encodeJson({
              instanceId: provider.instanceId,
              accountKey,
              checkedAt: limits.checkedAt,
              windows: enriched.map(
                ({ id, usedPercent, resetsAt, tokenEstimate, projectedUsedPercentAtReset }) => ({
                  id,
                  usedPercent,
                  resetsAt,
                  tokenEstimate,
                  ...(projectedUsedPercentAtReset !== undefined
                    ? { projectedUsedPercentAtReset }
                    : {}),
                }),
              ),
            }) + "\n";
          yield* fs.writeFileString(observationsPath, appendedLine, { flag: "a" });
          observationsBytes += Buffer.byteLength(appendedLine, "utf8");
          if (observationsBytes > maxObservationBytes) {
            const currentTail = yield* readObservationTail(
              fs,
              observationsPath,
              maxObservationBytes,
            );
            yield* writeCompactedObservations(currentTail.text);
          }
        }
        return { ...provider, usageLimits: { ...limits, windows: enriched } };
      }).pipe(
        Effect.tapError(Effect.logWarning),
        Effect.orElseSucceed(() => provider),
      ),
    );
  }
});
