import type {
  ModelSelection,
  ProviderDriverKind,
  ServerProviderModel,
  ServerProviderUsageWindow,
  UsageLimitsReport,
} from "@t3tools/contracts";
import { getProviderOptionCurrentValue, getProviderOptionDescriptors } from "@t3tools/shared/model";

import type { ContextWindowSnapshot } from "./contextWindow";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type UsageSeverity = "normal" | "warning" | "critical";

/** Blue while half or more is left, amber under 50% left, red under 10% left. */
export function usageSeverity(usedPercent: number): UsageSeverity {
  if (usedPercent > 90) return "critical";
  if (usedPercent > 50) return "warning";
  return "normal";
}

/** Whole percent used, clamped to 0..100. */
export function usedPercentLabel(usedPercent: number): number {
  return Math.round(Math.max(0, Math.min(100, usedPercent)));
}

/** `76.4k`, `200k`, `1M`, `950`. */
export function formatTokenCount(value: number): string {
  const tokens = Math.max(0, value);
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, "");
  if (tokens < 1_000) return `${Math.round(tokens)}`;
  if (tokens < 1_000_000) {
    // 999.95k would round up to "1000k"; read it as the next unit instead.
    const k = tokens / 1_000;
    return k >= 999.95 ? "1M" : `${trim(k)}k`;
  }
  return `${trim(tokens / 1_000_000)}M`;
}

/**
 * `Resets in 1 hr 42 min` inside a day, otherwise `Resets <formatAt>` (for
 * example `Resets Sun 9:00 PM`). `formatAt` owns locale and clock style.
 */
export function formatResetLabel(
  resetsAt: string | undefined,
  now: number,
  formatAt: (at: number) => string,
): string | null {
  if (resetsAt === undefined) return null;
  const at = Date.parse(resetsAt);
  if (!Number.isFinite(at)) return null;
  const left = at - now;
  if (left <= 0) return "Resets now";
  if (left >= DAY) return `Resets ${formatAt(at)}`;
  // Rounded up, so the countdown never reads "0 min" before the reset lands.
  const totalMinutes = Math.ceil(left / MINUTE);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `Resets in ${minutes} min`;
  if (minutes === 0) return `Resets in ${hours} hr`;
  return `Resets in ${hours} hr ${minutes} min`;
}

function windowRank(window: ServerProviderUsageWindow): number {
  if (window.kind === "session") return 0;
  // The account-wide weekly before per-model weeklies (`Weekly · <model>`).
  if (window.kind === "weekly") return window.label.includes("·") ? 2 : 1;
  return 3;
}

/** Session first, then the account-wide weekly, then everything else in report order. */
export function orderPlanWindows(
  windows: ReadonlyArray<ServerProviderUsageWindow>,
): ServerProviderUsageWindow[] {
  return windows
    .map((window, index) => ({ window, index }))
    .toSorted((a, b) => windowRank(a.window) - windowRank(b.window) || a.index - b.index)
    .map(({ window }) => window);
}

/**
 * Row label in Claude's wording: the session window reads `Session limit`, and
 * the account-wide weekly reads `Weekly · all models` when per-model weeklies
 * sit beside it.
 */
export function planWindowLabel(
  window: ServerProviderUsageWindow,
  windows?: ReadonlyArray<ServerProviderUsageWindow>,
): string {
  if (window.kind === "session" && window.label === "Session") return "Session limit";
  if (
    window.kind === "weekly" &&
    window.label === "Weekly" &&
    windows?.some((other) => other.kind === "weekly" && other.label.includes("·"))
  ) {
    return "Weekly · all models";
  }
  return window.label;
}

const PLAN_BRAND_PREFIX = /^(?:claude|chatgpt|codex|cursor|grok|opencode|gemini)\s+/i;
const PLAN_SUFFIX = /\s+(?:subscription|plan)$/i;

/** `Claude Pro Subscription` reads `Pro`, `ChatGPT Plus Subscription` reads `Plus`. */
export function shortPlanName(plan: string): string {
  const short = plan.trim().replace(PLAN_SUFFIX, "").replace(PLAN_BRAND_PREFIX, "").trim();
  return short || plan.trim();
}

/** `1m`, `1M`, `200k`, `128000` as tokens; null when the value is not a size. */
export function parseContextWindowSize(value: string): number | null {
  const match = /^\s*(\d+(?:\.\d+)?)\s*([km])?\s*$/i.exec(value);
  if (!match) return null;
  const unit = match[2]?.toLowerCase();
  const tokens = Number(match[1]) * (unit === "m" ? 1_000_000 : unit === "k" ? 1_000 : 1);
  return Number.isFinite(tokens) && tokens > 0 ? tokens : null;
}

/**
 * The model's context window in tokens: the size its `contextWindow` option
 * selects when it offers the choice, otherwise the fixed size the server sends.
 */
export function contextWindowTokensForModel(
  model: Pick<ServerProviderModel, "capabilities" | "contextWindowTokens"> | null | undefined,
  selection: ModelSelection | null | undefined,
): number | null {
  if (!model) return null;
  const descriptor = model.capabilities
    ? getProviderOptionDescriptors({
        caps: model.capabilities,
        selections: selection?.options,
      }).find((candidate) => candidate.id === "contextWindow")
    : undefined;
  const value = getProviderOptionCurrentValue(descriptor, selection);
  const selected = typeof value === "string" ? parseContextWindowSize(value) : null;
  if (selected) return selected;
  if (model.contextWindowTokens) return model.contextWindowTokens;
  if (!selection?.model) return null;
  const slug = selection.model.toLowerCase();
  if (slug.includes("1m") || slug.includes("gemini")) return 1_000_000;
  if (slug.includes("claude")) return 200_000;
  if (slug.includes("codex") || slug.includes("sol") || slug.includes("gpt")) return 128_000;
  return null;
}

/**
 * The thread's snapshot with the model's window filled in when the provider
 * has not reported one yet, or an empty `0 / <size>` snapshot before the
 * first report. Null when neither usage nor the size is known.
 */
export function withKnownContextWindow(
  snapshot: ContextWindowSnapshot | null,
  modelMaxTokens: number | null,
): ContextWindowSnapshot | null {
  if (snapshot && snapshot.maxTokens != null && snapshot.maxTokens > 0) return snapshot;
  if (modelMaxTokens === null) return snapshot;
  const usedTokens = snapshot?.usedTokens ?? 0;
  const usedPercentage = Math.min(100, (usedTokens / modelMaxTokens) * 100);
  const sized = {
    maxTokens: modelMaxTokens,
    remainingTokens: Math.max(0, Math.round(modelMaxTokens - usedTokens)),
    usedPercentage,
    remainingPercentage: Math.max(0, 100 - usedPercentage),
  };
  if (snapshot) return { ...snapshot, ...sized };
  return {
    usedTokens: 0,
    totalProcessedTokens: null,
    ...sized,
    inputTokens: null,
    cachedInputTokens: null,
    outputTokens: null,
    reasoningOutputTokens: null,
    lastUsedTokens: null,
    lastInputTokens: null,
    lastCachedInputTokens: null,
    lastOutputTokens: null,
    lastReasoningOutputTokens: null,
    toolUses: null,
    durationMs: null,
    compactsAutomatically: null,
    autoCompactThreshold: null,
    cost: null,
    updatedAt: new Date(0).toISOString(),
  };
}

/** `38% used` or `62% left`: the word is always spelled out so a newcomer never guesses. */
export function percentText(usedPercent: number, mode: "used" | "left" = "used"): string {
  const used = usedPercentLabel(usedPercent);
  return mode === "used" ? `${used}% used` : `${100 - used}% left`;
}

/** Short numeric percentage (`6%` or `94%`) for compact inline meter columns. */
export function compactPercentNumber(usedPercent: number, mode: "used" | "left" = "used"): string {
  const used = usedPercentLabel(usedPercent);
  return mode === "used" ? `${used}%` : `${100 - used}%`;
}

/**
 * Time until `resetsAt`: `Resets in 1 hr 30 min`, `Resets in 3 days 4 hr`, or in
 * compact form `1h 30m`, `3d 4h`. Minutes round up, so it never reads 0 before the
 * reset lands; days drop the minutes. Null when the provider sent no reset time.
 */
export function formatResetCountdown(
  resetsAt: string | undefined,
  now: number,
  compact = false,
): string | null {
  if (resetsAt === undefined) return null;
  const at = Date.parse(resetsAt);
  if (!Number.isFinite(at)) return null;
  const left = at - now;
  if (left <= 0) return compact ? "now" : "Resets now";
  const totalMinutes = Math.ceil(left / MINUTE);
  const days = Math.floor(totalMinutes / (DAY / MINUTE));
  const hours = Math.floor((totalMinutes % (DAY / MINUTE)) / 60);
  const minutes = totalMinutes % 60;
  const parts = compact
    ? days > 0
      ? [`${days}d`, hours > 0 ? `${hours}h` : null]
      : [hours > 0 ? `${hours}h` : null, minutes > 0 ? `${minutes}m` : null]
    : days > 0
      ? [`${days} ${days === 1 ? "day" : "days"}`, hours > 0 ? `${hours} hr` : null]
      : [hours > 0 ? `${hours} hr` : null, minutes > 0 ? `${minutes} min` : null];
  const text = parts.filter((part) => part !== null).join(" ");
  return compact ? text : `Resets in ${text}`;
}

function sessionHours(window: ServerProviderUsageWindow): number | null {
  const mins = window.windowDurationMins;
  return mins !== undefined && mins > 0 && mins < DAY / MINUTE && mins % 60 === 0
    ? mins / 60
    : null;
}

/**
 * Plain window names. `glance` (hover card): `5-hour limit`, `Weekly limit`.
 * `panel`: `5-hour session`, `Weekly, all models`, `Weekly, Opus`.
 */
export function limitLabel(window: ServerProviderUsageWindow, style: "glance" | "panel"): string {
  if (window.kind === "session") {
    const hours = sessionHours(window);
    if (style === "glance") return hours ? `${hours}-hour limit` : "Session limit";
    return hours ? `${hours}-hour session` : "Session";
  }
  if (window.kind === "weekly") {
    const model = window.label.includes("·")
      ? window.label.split("·").slice(1).join("·").trim()
      : "";
    if (style === "glance") return model ? `Weekly limit, ${model}` : "Weekly limit";
    return model ? `Weekly, ${model}` : "Weekly, all models";
  }
  if (window.kind === "monthly" && style === "glance") return "Monthly limit";
  return window.label;
}

/** Short label for compact inline rows: `5-hour`, `Weekly`, `Monthly`. */
export function compactWindowLabel(
  window: ServerProviderUsageWindow | null,
  fallback: string,
): string {
  if (!window) return fallback.replace(/\s+limit$/i, "");
  if (window.kind === "session") {
    const hours = sessionHours(window);
    const group = window.label.includes("·") ? window.label.split("·")[0]?.trim() : "";
    if (group && group.toLowerCase() !== "session") {
      return `${group} ${hours ? `${hours}h` : "5h"}`;
    }
    return hours ? `${hours}-hour` : "Session";
  }
  if (window.kind === "weekly") {
    const parts = window.label.split("·").map((s) => s.trim());
    if (parts.length > 1) {
      const qualifier = parts[0]?.toLowerCase() === "weekly" ? parts[1] : parts[0];
      if (qualifier) return `${qualifier} wk`;
    }
    return "Weekly";
  }
  if (window.kind === "monthly") return "Monthly";
  return window.label.replace(/\s+limit$/i, "");
}

export interface GlanceLimitRow {
  readonly key: string;
  readonly label: string;
  /** Null when the provider reports other windows but not this one yet. */
  readonly window: ServerProviderUsageWindow | null;
}

/**
 * A window whose reset time has passed holds the old window's numbers: the provider no
 * longer reports it. Read it as fresh, 0% used, with no reset time left to count down.
 */
export function expireElapsedWindow(
  window: ServerProviderUsageWindow,
  now: number,
): ServerProviderUsageWindow {
  if (window.resetsAt === undefined || !(Date.parse(window.resetsAt) <= now)) return window;
  const { resetsAt: _elapsed, ...rest } = window;
  return { ...rest, usedPercent: 0 };
}

/**
 * The hover card's two rows: the session and the account-wide weekly. A missing one
 * stays as a "not reported" row so the card never shifts; a provider with neither
 * (monthly-only) shows its own first two windows instead. Empty when nothing reports.
 */
export function glanceLimitRows(
  windows: ReadonlyArray<ServerProviderUsageWindow>,
  now?: number,
): GlanceLimitRow[] {
  if (windows.length === 0) return [];
  const ordered = orderPlanWindows(
    now === undefined ? windows : windows.map((window) => expireElapsedWindow(window, now)),
  );
  const plainWeekly =
    ordered.find((window) => window.kind === "weekly" && !window.label.includes("·")) ?? null;
  // Antigravity labels every window by model group (`Gemini · 5-hour`, `Gemini · Weekly`),
  // so none is account-wide. Show the group closest to its limit, session and weekly together.
  const groupOf = (window: ServerProviderUsageWindow) => window.label.split("·")[0]?.trim();
  const groupedSessions = ordered.filter(
    (window) => window.kind === "session" && window.label.includes("·"),
  );
  const pairs = groupedSessions.map((candidate) => ({
    session: candidate,
    weekly:
      ordered.find(
        (window) => window.kind === "weekly" && groupOf(window) === groupOf(candidate),
      ) ?? null,
  }));
  const pressure = (pair: (typeof pairs)[number]) =>
    Math.max(pair.session.usedPercent, pair.weekly?.usedPercent ?? 0);
  const closest = pairs.reduce<(typeof pairs)[number] | null>(
    (best, pair) => (best === null || pressure(pair) > pressure(best) ? pair : best),
    null,
  );
  const session = plainWeekly
    ? (ordered.find((window) => window.kind === "session") ?? null)
    : (closest?.session ?? ordered.find((window) => window.kind === "session") ?? null);
  const weekly = plainWeekly ?? closest?.weekly ?? null;
  if (!session && !weekly) {
    return ordered
      .slice(0, 2)
      .map((window) => ({ key: window.id, label: limitLabel(window, "glance"), window }));
  }
  return [
    {
      key: session?.id ?? "session",
      label: session ? limitLabel(session, "glance") : "5-hour limit",
      window: session,
    },
    { key: weekly?.id ?? "weekly", label: "Weekly limit", window: weekly },
  ];
}

/**
 * Extra quota windows not shown in the primary 2 rows (e.g. `Weekly · Fable` or secondary
 * model pools), formatted for the compact bottom sub-pill (`Fable wk 0%`).
 */
export function extraWindowSummaries(
  windows: ReadonlyArray<ServerProviderUsageWindow>,
  primaryRows: ReadonlyArray<GlanceLimitRow>,
  mode: "used" | "left" = "used",
  now?: number,
): ReadonlyArray<{ readonly id: string; readonly label: string; readonly value: string }> {
  const shownIds = new Set(primaryRows.flatMap((row) => (row.window ? [row.window.id] : [])));
  const current =
    now === undefined ? windows : windows.map((window) => expireElapsedWindow(window, now));
  return orderPlanWindows(current)
    .filter((window) => !shownIds.has(window.id))
    .slice(0, 2)
    .map((window) => ({
      id: window.id,
      label: compactWindowLabel(window, window.label),
      value: compactPercentNumber(window.usedPercent, mode),
    }));
}

/**
 * The account's name as the user set it in Providers; otherwise the provider's name,
 * plus the usage source for hub accounts so two of them stay distinguishable.
 */
export function accountTitle(
  account: { readonly displayName?: string | undefined; readonly sourceLabel?: string | undefined },
  driverLabel: string,
): string {
  const custom = account.displayName?.trim();
  if (custom) return custom;
  return account.sourceLabel ? `${driverLabel} · ${account.sourceLabel}` : driverLabel;
}

/**
 * Split an account's display name into the provider lead (`Claude`) and account/tier
 * qualifier (`Jake · Max` or `Personal (Max)`) so grouped cards never repeat the brand.
 */
export function splitAccountHeader(
  account: {
    readonly displayName?: string | undefined;
    readonly label: string;
    readonly plan?: string | undefined;
    readonly sourceLabel?: string | undefined;
  },
  driverLabel: string,
): { readonly primaryName: string; readonly subtitle: string | null } {
  const raw = accountTitle(account, driverLabel);
  const parenMatch = /^(.+?)\s*\(([^)]+)\)\s*$/.exec(raw);
  const qualifier = parenMatch
    ? parenMatch[2]!.trim()
    : raw.toLowerCase() !== driverLabel.toLowerCase()
      ? raw.replace(new RegExp(`^${driverLabel}\\s*[·\\-:]?\\s*`, "i"), "").trim()
      : "";
  const planTier = account.plan ? shortPlanName(account.plan) : "";
  const parts = [
    qualifier && qualifier.toLowerCase() !== driverLabel.toLowerCase() ? qualifier : null,
    planTier &&
    planTier.toLowerCase() !== qualifier.toLowerCase() &&
    planTier.toLowerCase() !== driverLabel.toLowerCase()
      ? planTier
      : null,
  ].filter((part): part is string => Boolean(part));
  return {
    primaryName: driverLabel,
    subtitle: parts.length > 0 ? parts.join(" · ") : null,
  };
}

/** Short sibling summary for the provider card sub-pill (`Justine: 5h 48% · wk 41%`). */
export function siblingAccountSummary(
  account: UsageLimitsReport["accounts"][number],
  driverLabel: string,
  mode: "used" | "left" = "used",
  now?: number,
): { readonly id: string; readonly name: string; readonly summary: string } {
  const { subtitle } = splitAccountHeader(account, driverLabel);
  const name = subtitle ?? accountTitle(account, driverLabel);
  const rows = glanceLimitRows(account.limits.windows, now);
  const session = rows.find((r) => r.window?.kind === "session")?.window ?? null;
  const weekly = rows.find((r) => r.window?.kind === "weekly")?.window ?? null;
  const metrics = [
    session ? `5h ${compactPercentNumber(session.usedPercent, mode)}` : null,
    weekly ? `wk ${compactPercentNumber(weekly.usedPercent, mode)}` : null,
  ].filter((part): part is string => part !== null);
  return {
    id: account.id,
    name,
    summary: metrics.length > 0 ? metrics.join(" · ") : "pending",
  };
}

export interface ProviderAccountGroup {
  readonly driver: ProviderDriverKind;
  readonly primary: UsageLimitsReport["accounts"][number];
  readonly siblings: ReadonlyArray<UsageLimitsReport["accounts"][number]>;
  readonly hasActive: boolean;
}

/**
 * Group connected accounts by provider driver so 4 Claude accounts render as one sleek
 * provider card with a sibling summary/swap strip instead of 4 full card blocks.
 */
export function groupAccountsByProvider(
  accounts: ReadonlyArray<UsageLimitsReport["accounts"][number]>,
  activeIds: ReadonlySet<string>,
  selectedPrimaryByDriver?: Readonly<Record<string, string>>,
): ReadonlyArray<ProviderAccountGroup> {
  const byDriver = new Map<ProviderDriverKind, Array<UsageLimitsReport["accounts"][number]>>();
  for (const account of accounts) {
    const existing = byDriver.get(account.driver);
    if (existing) existing.push(account);
    else byDriver.set(account.driver, [account]);
  }
  return [...byDriver.entries()].map(([driver, members]) => {
    const pinnedId = selectedPrimaryByDriver?.[driver];
    const primary =
      (pinnedId ? members.find((m) => m.id === pinnedId) : undefined) ??
      members.find((m) => activeIds.has(m.id)) ??
      members[0]!;
    const primaryIndex = members.findIndex((m) => m.id === primary.id);
    // Rotate siblings after the current primary so clicking Swap cycles A -> B -> C -> A.
    const siblings =
      primaryIndex >= 0
        ? [...members.slice(primaryIndex + 1), ...members.slice(0, primaryIndex)]
        : members.filter((m) => m.id !== primary.id);
    return {
      driver,
      primary,
      siblings,
      hasActive: members.some((m) => activeIds.has(m.id)),
    };
  });
}

export type ContextWindowFigures =
  | { readonly state: "missing" }
  | { readonly state: "pending"; readonly maxTokens: number }
  | {
      readonly state: "reported";
      readonly usedTokens: number;
      readonly maxTokens: number | null;
      readonly usedPercent: number | null;
    };

/**
 * What the context window can honestly show: nothing known, only the model's size
 * (no report yet, so no zero is invented), or the reported figure.
 */
export function contextWindowFigures(snapshot: ContextWindowSnapshot | null): ContextWindowFigures {
  if (!snapshot) return { state: "missing" };
  const sized = snapshot.maxTokens != null && snapshot.maxTokens > 0 ? snapshot.maxTokens : null;
  if (snapshot.updatedAt === new Date(0).toISOString()) {
    return sized === null ? { state: "missing" } : { state: "pending", maxTokens: sized };
  }
  return {
    state: "reported",
    usedTokens: Math.max(0, snapshot.usedTokens),
    maxTokens: sized,
    usedPercent: snapshot.usedPercentage == null ? null : usedPercentLabel(snapshot.usedPercentage),
  };
}

/** Limits older than this are drawn as stale: the source has not been read in a while. */
const LIMITS_STALE_AFTER_MS = 10 * MINUTE;

/**
 * How current the numbers on the card are: the oldest read among the accounts
 * shown, so one stale account is never hidden behind a fresh one. Null when no
 * account carries a read time.
 */
export function limitsFreshness(
  checkedAt: ReadonlyArray<string>,
  now: number,
  style: "checked" | "updated" = "checked",
): { readonly label: string; readonly stale: boolean } | null {
  const times = checkedAt.map((value) => Date.parse(value)).filter(Number.isFinite);
  if (times.length === 0) return null;
  const age = Math.max(0, now - Math.min(...times));
  const minutes = Math.floor(age / MINUTE);
  const label =
    style === "updated"
      ? minutes < 1
        ? "updated just now"
        : minutes < 60
          ? `updated ${minutes} min ago`
          : `updated ${Math.floor(minutes / 60)} hr ago`
      : minutes < 1
        ? "Checked just now"
        : minutes < 60
          ? `Checked ${minutes} min ago`
          : `Checked ${Math.floor(minutes / 60)} hr ago`;
  return { label, stale: age > LIMITS_STALE_AFTER_MS };
}

/** Compact per-account freshness (`updated 2m ago`) for card headers. */
export function accountFreshnessLabel(checkedAt: string | undefined, now: number): string | null {
  if (!checkedAt) return null;
  const time = Date.parse(checkedAt);
  if (!Number.isFinite(time)) return null;
  const age = Math.max(0, now - time);
  const minutes = Math.floor(age / MINUTE);
  if (minutes < 1) return "updated now";
  if (minutes < 60) return `updated ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `updated ${hours}h ago`;
  return `updated ${Math.floor(hours / 24)}d ago`;
}
