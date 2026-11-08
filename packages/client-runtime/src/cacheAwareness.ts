/** Provider evidence only. Missing fields never imply a cache miss or a lifetime. */
export interface CacheObservation {
  readonly inputTokens?: number | null | undefined;
  readonly cachedInputTokens?: number | null | undefined;
  readonly reportedAt: number;
  readonly ttlMs?: number | undefined;
  /** Time of the latest model call. Each call refreshes the cache. */
  readonly anchorAt?: number | undefined;
}
export type CacheWarningCategory =
  | "model"
  | "account"
  | "configuration"
  | "context"
  | "expiry"
  | "reuse-drop";
export interface CacheImpact {
  readonly category: CacheWarningCategory;
  readonly confirmed: boolean;
  readonly message: string;
}
const valid = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export function cacheStatus(observation: CacheObservation | null, now: number) {
  const read = observation?.cachedInputTokens;
  const input = observation?.inputTokens;
  const readRate = valid(read) && valid(input) && input > 0 && read <= input ? read / input : null;
  const remainingMs =
    observation &&
    valid(observation.ttlMs) &&
    observation.ttlMs > 0 &&
    valid(observation.anchorAt) &&
    valid(now) &&
    observation.anchorAt <= now &&
    observation.anchorAt <= observation.reportedAt
      ? Math.max(0, observation.anchorAt + observation.ttlMs - now)
      : null;
  const state = !valid(read)
    ? "unknown"
    : read === 0
      ? "no-reuse"
      : remainingMs === null
        ? "reported"
        : remainingMs === 0
          ? "possibly-expired"
          : "estimated";
  return { state, remainingMs, readRate } as const;
}

export function cacheActionImpact(
  from:
    | { readonly instanceId: string; readonly model: string; readonly options?: unknown }
    | null
    | undefined,
  to: { readonly instanceId: string; readonly model: string; readonly options?: unknown },
  hasReusableContext: boolean,
): CacheImpact | null {
  if (!from || !hasReusableContext) return null;
  if (from.instanceId !== to.instanceId)
    return {
      category: "account",
      confirmed: false,
      message: "A new connection starts a new cache. The next message may cost more.",
    };
  if (from.model !== to.model)
    return {
      category: "model",
      confirmed: true,
      message: "A new model cannot use this cache. The next message may cost more.",
    };
  if (JSON.stringify(from.options ?? {}) !== JSON.stringify(to.options ?? {}))
    return {
      category: "configuration",
      confirmed: false,
      message: "Changed options can reduce cache reuse. The next message may cost more.",
    };
  return null;
}

export interface CacheNoticeRecord {
  readonly key: string;
  readonly observation: CacheObservation;
  readonly lastViewedAt: number;
  readonly notifiedCycle: number | null;
}
export function collectExpiryNotices(
  records: readonly CacheNoticeRecord[],
  now: number,
  snoozedUntil: number,
) {
  if (!valid(now) || snoozedUntil > now) return [];
  return records.filter((record) => {
    const status = cacheStatus(record.observation, now);
    const ttl = record.observation.ttlMs;
    return (
      now >= record.lastViewedAt &&
      now - record.lastViewedAt <= 60 * 60_000 &&
      record.notifiedCycle !== record.observation.anchorAt &&
      status.state === "estimated" &&
      status.remainingMs !== null &&
      status.remainingMs <= Math.min(10 * 60_000, (ttl ?? 0) * 0.2)
    );
  });
}
