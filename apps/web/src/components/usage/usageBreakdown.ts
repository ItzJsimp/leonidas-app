import type { UsageProviderKind, UsageTokenTotals } from "@t3tools/contracts";
import {
  isModelCostUnknown,
  type CategoryCost,
  type MergedUsage,
  type ModelTotals,
  type ProviderTotals,
  type SourceTotals,
  type SpeedCost,
} from "@t3tools/shared/usageMerge";

import type { ShareSegment } from "./UsageShareBar";

export function sortModelsByTokens(models: readonly ModelTotals[]) {
  return models.toSorted(
    (left, right) => right.totalTokens - left.totalTokens || right.costUsd - left.costUsd,
  );
}

/**
 * A model's share of the selected metric, or `null` for a cost share of an
 * unknown cost. An unpriced model still has a real token share.
 */
export function modelShare(model: ModelTotals, metric: "cost" | "tokens"): number | null {
  if (metric === "tokens") return model.tokenShare;
  return isModelCostUnknown(model) ? null : model.costShare;
}

/**
 * Share of a model's input read from cache, or `null` without input. Cache
 * writes count as misses: that input was processed in full.
 */
export function cacheHitRate({ tokens }: ModelTotals): number | null {
  const input = tokens.uncachedInputTokens + tokens.cachedInputTokens + tokens.cacheCreationTokens;
  return input === 0 ? null : tokens.cachedInputTokens / input;
}

/**
 * Tokens that were actually worked on: uncached input, cache writes and output.
 * Cache reads are the same context re-read each turn, so they inflate processed
 * totals without tracking real work or subscription quota.
 */
export function freshTokens(
  tokens: Pick<UsageTokenTotals, "uncachedInputTokens" | "cacheCreationTokens" | "outputTokens">,
): number {
  return tokens.uncachedInputTokens + tokens.cacheCreationTokens + tokens.outputTokens;
}

export const CACHE_READ_NOTE =
  "Includes reused text: the AI reads the same chat again with each reply. New text is closer to the real work and to your limit.";

/** Cost figures are list-price estimates, not what a plan bills. */
export const API_COST_NOTE =
  "What this text would cost at public prices. Your subscription plan is billed separately.";

/** Effective USD per million priced tokens, or `null` when none were priced. */
export function costPerMillionTokens(model: ModelTotals): number | null {
  const pricedTokens = model.totalTokens - model.unpricedTokens;
  return pricedTokens <= 0 || isModelCostUnknown(model)
    ? null
    : (model.costUsd / pricedTokens) * 1_000_000;
}

const ink = (percent: number) =>
  `color-mix(in oklab, var(--foreground) ${percent}%, var(--background))`;

const TYPE_COLORS = {
  input: ink(60),
  cacheRead: ink(30),
  cacheWrite: ink(72),
  output: ink(100),
  other: ink(44),
};

export function costTypeSegments(cost: CategoryCost): readonly ShareSegment[] {
  return [
    { label: "Input", value: cost.input, color: TYPE_COLORS.input },
    { label: "Cache read", value: cost.cacheRead, color: TYPE_COLORS.cacheRead },
    { label: "Cache write", value: cost.cacheWrite, color: TYPE_COLORS.cacheWrite },
    { label: "Output", value: cost.output, color: TYPE_COLORS.output },
    { label: "Other", value: cost.unsplit >= 0.005 ? cost.unsplit : 0, color: TYPE_COLORS.other },
  ];
}

export function tokenTypeSegments(
  tokens: Omit<UsageTokenTotals, "reasoningTokens">,
): readonly ShareSegment[] {
  return [
    { label: "New text sent", value: tokens.uncachedInputTokens, color: TYPE_COLORS.input },
    { label: "Reused text", value: tokens.cachedInputTokens, color: TYPE_COLORS.cacheRead },
    { label: "Saved for reuse", value: tokens.cacheCreationTokens, color: TYPE_COLORS.cacheWrite },
    { label: "Text the AI wrote", value: tokens.outputTokens, color: TYPE_COLORS.output },
  ];
}

export function speedCostSegments(cost: SpeedCost): readonly ShareSegment[] {
  return [
    { label: "Standard", value: cost.standard, color: ink(34) },
    { label: "Fast", value: cost.fast, color: ink(66) },
    { label: "Ultrafast", value: cost.ultrafast, color: ink(100) },
  ];
}

/**
 * Placeholder ids the readers emit when a record carried no usable model name,
 * and Antigravity numeric ids the server could not name.
 */
export function displayModelName(model: string): string {
  if (model === "antigravity-unknown" || model === "<synthetic>") return "Unknown";
  const unmapped = /^antigravity-model-(\d+)$/.exec(model);
  return unmapped ? `Antigravity model ${unmapped[1]} (unmapped)` : model;
}

export interface UsageHighlight {
  readonly label: string;
  readonly value: string;
  readonly detail?: string | undefined;
}

/**
 * The few figures people open this page to find: where the tokens went, how
 * well the cache worked, and what a session costs. Pure so it can be tested.
 */
export function usageHighlights(
  merged: MergedUsage,
  format: { readonly tokens: (n: number) => string; readonly usd: (n: number) => string },
  percent: (n: number) => string,
): readonly UsageHighlight[] {
  const highlights: UsageHighlight[] = [];
  const top = sortModelsByTokens(merged.models)[0];
  if (top && merged.totalTokens > 0) {
    highlights.push({
      label: "Top model",
      value: displayModelName(top.model),
      detail: `${percent(top.tokenShare)} of the text`,
    });
  }
  const input = merged.uncachedInputTokens + merged.cachedInputTokens + merged.cacheCreationTokens;
  if (input > 0) {
    highlights.push({
      label: "Reused text",
      value: percent(merged.cachedInputTokens / input),
      detail: `${format.usd(merged.costQuality.cacheSavingsUsd)} saved`,
    });
  }
  if (merged.sessions > 0 && merged.totalTokens > 0) {
    highlights.push({
      label: "Per chat",
      value: format.tokens(merged.totalTokens / merged.sessions),
      detail:
        merged.costUsd > 0 ? `${format.usd(merged.costUsd / merged.sessions)} average` : undefined,
    });
  }
  if (merged.outputTokens > 0 && input > 0) {
    highlights.push({
      label: "Share the AI wrote",
      value: percent(merged.outputTokens / merged.totalTokens),
      detail: `${format.tokens(merged.outputTokens)} written`,
    });
  }
  return highlights;
}

/**
 * Models that cost nothing by design: OpenRouter `:free` routes, and models
 * served from this machine (Ollama, LM Studio, llama.cpp style ids). Shown as
 * an explicit $0 instead of "Unpriced", which reads as "we don't know".
 */
export function freeModelKind(model: string): "free" | "local" | null {
  const id = model.toLowerCase();
  if (id.endsWith(":free")) return "free";
  if (/^(ollama|lmstudio|lm-studio|llamacpp|llama\.cpp|local)[/:]/.test(id)) return "local";
  return null;
}

/**
 * Account label from a provider home directory: its basename without the
 * leading dot and provider name, so `.claude` is "default" and
 * `.claude-simplygersi` is "simplygersi".
 */
function sourceLabel(provider: UsageProviderKind, sourcePath: string | undefined): string {
  if (sourcePath === undefined) return "Other";
  const base = sourcePath.split(/[\\/]+/).findLast((part) => part !== "") ?? sourcePath;
  const stem = base.replace(/^\.+/, "").replace(new RegExp(`^${provider}[-_]?`, "i"), "");
  return stem === "" ? "default" : stem;
}

export interface ProviderBreakdownRow {
  readonly totals: ProviderTotals;
  /** One row per provider home directory, only when the provider has two or more. */
  readonly sources: readonly { readonly label: string; readonly totals: SourceTotals }[];
}

/** Provider rows in the given order, each with per-account children when it has several homes. */
export function providerBreakdownRows(
  providers: readonly ProviderTotals[],
): readonly ProviderBreakdownRow[] {
  return providers.map((totals) => {
    if (totals.sources.length < 2) return { totals, sources: [] };
    const labels = totals.sources.map((source) => sourceLabel(totals.provider, source.sourcePath));
    return {
      totals,
      sources: totals.sources.map((source, index) => {
        const label = labels[index] ?? "default";
        // The same folder name on two machines: the full path tells them apart.
        const ambiguous = labels.indexOf(label) !== labels.lastIndexOf(label);
        return { label: ambiguous ? (source.sourcePath ?? label) : label, totals: source };
      }),
    };
  });
}

export interface AccountBreakdownRow {
  readonly provider: UsageProviderKind;
  readonly label: string;
  readonly sourcePath: string | undefined;
  readonly totals: SourceTotals;
}

/** One flat row per provider home (account), largest first, including single-home providers. */
export function accountBreakdownRows(
  providers: readonly ProviderTotals[],
): readonly AccountBreakdownRow[] {
  return providers
    .flatMap((entry) => {
      const labels = entry.sources.map((source) => sourceLabel(entry.provider, source.sourcePath));
      return entry.sources.map((source, index) => {
        const label = labels[index] ?? "default";
        const ambiguous = labels.indexOf(label) !== labels.lastIndexOf(label);
        return {
          provider: entry.provider,
          label: ambiguous ? (source.sourcePath ?? label) : label,
          sourcePath: source.sourcePath,
          totals: source,
        };
      });
    })
    .toSorted((a, b) => b.totals.totalTokens - a.totals.totalTokens);
}
