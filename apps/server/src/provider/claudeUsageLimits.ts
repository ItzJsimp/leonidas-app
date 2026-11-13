import type { SDKControlGetUsageResponse, SDKRateLimitInfo } from "@anthropic-ai/claude-agent-sdk";
import type {
  ProviderUsageLimitsUpdate,
  ServerProviderUsageLimits,
  ServerProviderUsageWindow,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";

import {
  clampPercent,
  makeUnavailableUsageLimits,
  makeUsageLimits,
} from "@t3tools/provider-core/server/usageLimits";

import type { ChatQuotaReading } from "../usage/chatQuota.ts";

const SESSION_MINS = 5 * 60;
const WEEK_MINS = 7 * 24 * 60;

const WINDOWS: Readonly<
  Record<string, Pick<ServerProviderUsageWindow, "kind" | "label" | "windowDurationMins">>
> = {
  five_hour: { kind: "session", label: "Session", windowDurationMins: SESSION_MINS },
  seven_day: { kind: "weekly", label: "Weekly", windowDurationMins: WEEK_MINS },
};

/**
 * The streamed event names the overage-included bucket by type
 * (`seven_day_overage_included`), while `get_usage` names it by the model's
 * `display_name`. Which model that is changes over time, so the probe records
 * the name it saw and the event mapper reuses it; the mid-turn update then
 * lands on the row the probe drew instead of opening a second one.
 */
const OVERAGE_INCLUDED_EVENT_TYPE = "seven_day_overage_included";

// The SDK does not yet type the spend budget returned by `get_usage`.
const SpendMoney = Schema.Struct({
  amount_minor: Schema.Natural,
  currency: Schema.NonEmptyString,
  exponent: Schema.Natural,
});
const decodeSpendBudget = Schema.decodeUnknownOption(
  Schema.Struct({ enabled: Schema.Boolean, used: SpendMoney, limit: SpendMoney }),
);

export interface ClaudeScopedLimitNames {
  readonly overageIncluded: string | undefined;
}

export const makeClaudeScopedLimitNames = Ref.make<ClaudeScopedLimitNames>({
  overageIncluded: undefined,
});

function scopedWindowId(displayName: string): string {
  return `seven_day_${displayName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
}

function scopedWindow(
  displayName: string,
  usedPercent: number,
  resetsAt: string | undefined,
): ServerProviderUsageWindow {
  return {
    id: scopedWindowId(displayName),
    kind: "weekly",
    label: `Weekly · ${displayName}`,
    windowDurationMins: WEEK_MINS,
    usedPercent: clampPercent(usedPercent),
    ...(resetsAt ? { resetsAt } : {}),
  };
}

function percentFromAmounts(used: number | null | undefined, limit: number | null | undefined) {
  if (
    typeof used !== "number" ||
    typeof limit !== "number" ||
    !Number.isFinite(used) ||
    !Number.isFinite(limit) ||
    used < 0 ||
    limit <= 0
  ) {
    return undefined;
  }
  const percent = (used / limit) * 100;
  return Number.isFinite(percent) ? clampPercent(percent) : undefined;
}

function readSpendPercent(rateLimits: NonNullable<SDKControlGetUsageResponse["rate_limits"]>) {
  const spend = Option.getOrUndefined(
    decodeSpendBudget((rateLimits as { readonly spend?: unknown }).spend),
  );
  // Minor-unit ratios require matching currency and scale; spend.percent is rounded.
  if (
    spend?.enabled &&
    spend.used.currency.trim().length > 0 &&
    spend.used.currency.trim() === spend.limit.currency.trim() &&
    spend.used.exponent === spend.limit.exponent
  ) {
    const percent = percentFromAmounts(spend.used.amount_minor, spend.limit.amount_minor);
    if (percent !== undefined) return percent;
  }

  const extra = rateLimits.extra_usage;
  if (extra?.is_enabled !== true) return undefined;
  const percent = percentFromAmounts(extra.used_credits, extra.monthly_limit) ?? extra.utilization;
  return typeof percent === "number" && Number.isFinite(percent) && percent >= 0
    ? clampPercent(percent)
    : undefined;
}

/**
 * `model_scoped` shipped in the CLI after the SDK typings we pin, so it is
 * read structurally until the `.d.ts` catches up.
 */
interface ModelScopedWindow {
  readonly display_name: string;
  readonly utilization: number | null;
  readonly resets_at: string | null;
}

function readModelScoped(rateLimits: object): ReadonlyArray<ModelScopedWindow> {
  const raw = (rateLimits as { readonly model_scoped?: unknown }).model_scoped;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is ModelScopedWindow =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as ModelScopedWindow).display_name === "string",
  );
}

function isoFromEpochSeconds(value: number | undefined): string | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return undefined;
  const dt = DateTime.make(value * 1000);
  return Option.isSome(dt) ? DateTime.formatIso(dt.value) : undefined;
}

function isoFromString(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const dt = DateTime.make(value);
  return Option.isSome(dt) ? DateTime.formatIso(dt.value) : undefined;
}

function makeWindow(
  id: keyof typeof WINDOWS & string,
  usedPercent: number,
  resetsAt: string | undefined,
): ServerProviderUsageWindow {
  const window = WINDOWS[id]!;
  return {
    id,
    ...window,
    usedPercent: clampPercent(usedPercent),
    ...(resetsAt ? { resetsAt } : {}),
  };
}

/**
 * Utilization is a 0–1 fraction on the streamed event. An overage-included
 * event before any probe has named the bucket is dropped: guessing a name
 * would draw a row the next probe cannot reconcile.
 */
export function claudeRateLimitEventToUpdate(
  info: SDKRateLimitInfo,
  names: ClaudeScopedLimitNames,
): ProviderUsageLimitsUpdate | undefined {
  const type: string | undefined = info.rateLimitType;
  if (!type) {
    return undefined;
  }
  const isRejected = info.status === "rejected";
  if (typeof info.utilization !== "number" && !isRejected) {
    return undefined;
  }
  const usedPercent = typeof info.utilization === "number" ? info.utilization * 100 : 100;
  const resetsAt = isoFromEpochSeconds(info.resetsAt);
  if (Object.hasOwn(WINDOWS, type)) {
    return { windows: [makeWindow(type, usedPercent, resetsAt)] };
  }
  if (type === OVERAGE_INCLUDED_EVENT_TYPE && names.overageIncluded) {
    return { windows: [scopedWindow(names.overageIncluded, usedPercent, resetsAt)] };
  }
  return undefined;
}

const UnifiedWindow = Schema.Struct({
  utilization: Schema.optional(Schema.Number),
  resetsAt: Schema.optional(Schema.Number),
});
// The CLI sends both windows on each event, but the SDK type does not name the field yet.
const decodeUnifiedWindows = Schema.decodeUnknownOption(
  Schema.Struct({
    unifiedWindows: Schema.Struct({
      five_hour: Schema.optional(UnifiedWindow),
      seven_day: Schema.optional(UnifiedWindow),
    }),
  }),
);

/** Both plan windows from one streamed event, as 0–100 percents, for per-chat attribution. */
export function claudeRateLimitEventToChatQuota(
  info: SDKRateLimitInfo,
  threadId: string,
  at: number,
): ChatQuotaReading | undefined {
  const toWindow = (value: typeof UnifiedWindow.Type | undefined) =>
    typeof value?.utilization === "number"
      ? { usedPercent: value.utilization * 100, resetsAt: isoFromEpochSeconds(value.resetsAt) }
      : undefined;
  const unified = decodeUnifiedWindows(info);
  const fromType = (type: string) =>
    info.rateLimitType === type
      ? toWindow({ utilization: info.utilization, resetsAt: info.resetsAt })
      : undefined;
  const fiveHour = Option.isSome(unified)
    ? toWindow(unified.value.unifiedWindows.five_hour)
    : fromType("five_hour");
  const weekly = Option.isSome(unified)
    ? toWindow(unified.value.unifiedWindows.seven_day)
    : fromType("seven_day");
  if (!fiveHour && !weekly) return undefined;
  return { at, threadId, ...(fiveHour ? { fiveHour } : {}), ...(weekly ? { weekly } : {}) };
}

/**
 * Percentages on the `get_usage` response are already 0–100.
 */
export function claudeUsageResponseToLimits(input: {
  readonly response: Pick<SDKControlGetUsageResponse, "rate_limits_available" | "rate_limits">;
  readonly checkedAt: string;
}): { readonly limits: ServerProviderUsageLimits; readonly names: ClaudeScopedLimitNames } {
  const { response, checkedAt } = input;
  const names = { overageIncluded: undefined };
  if (!response.rate_limits_available) {
    return { limits: makeUnavailableUsageLimits({ checkedAt, reason: "unsupported" }), names };
  }
  // A subscription whose `rate_limits` came back null is not limitless: the CLI's usage
  // endpoint was rate limited (HTTP 429) or has not seen a request yet. `probeFailed`
  // stays retryable, so the next probe or a streamed `rate_limit_event` fills the bars;
  // `unsupported` would be sticky and hide them for good.
  if (!response.rate_limits) {
    return {
      limits: makeUnavailableUsageLimits({
        checkedAt,
        reason: response.rate_limits_available ? "probeFailed" : "unsupported",
        message: "Claude has not reported limits yet. They appear after your next message.",
      }),
      names,
    };
  }
  const windows: ServerProviderUsageWindow[] = [];
  for (const id of Object.keys(WINDOWS)) {
    const window = response.rate_limits[id as "five_hour" | "seven_day"];
    if (!window || typeof window.utilization !== "number") continue;
    windows.push(makeWindow(id, window.utilization, isoFromString(window.resets_at)));
  }
  // The CLI filters `model_scoped` to the overage-included allowlist, which
  // today holds one model; the first entry is the one the event refers to.
  let overageIncluded: string | undefined;
  for (const entry of readModelScoped(response.rate_limits)) {
    if (typeof entry.utilization !== "number") continue;
    windows.push(
      scopedWindow(entry.display_name, entry.utilization, isoFromString(entry.resets_at)),
    );
    overageIncluded ??= entry.display_name;
  }
  const spendPercent = readSpendPercent(response.rate_limits);
  if (spendPercent !== undefined) {
    windows.push({
      id: "monthly_spend",
      kind: "monthly",
      label: "Monthly spend",
      usedPercent: spendPercent,
    });
  }
  return {
    limits: makeUsageLimits({ checkedAt, windows }),
    names: { overageIncluded },
  };
}

export const recordClaudeUsageResponse = (
  namesRef: Ref.Ref<ClaudeScopedLimitNames>,
  input: Parameters<typeof claudeUsageResponseToLimits>[0],
): Effect.Effect<ServerProviderUsageLimits> => {
  const { limits, names } = claudeUsageResponseToLimits(input);
  return Ref.set(namesRef, names).pipe(Effect.as(limits));
};
