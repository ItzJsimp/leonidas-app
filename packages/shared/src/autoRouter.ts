/**
 * Leonidas Autorouter: picks one concrete provider instance and model for a
 * turn from the providers the user has connected.
 *
 * Pure and synchronous so the composer can route on send with no round trip,
 * and the server (MCP, scheduled tasks) can reuse the same decision.
 * The caller passes only candidates that are ready to run; this module never
 * reads settings or snapshots itself.
 *
 * A model's score is its fit for the task and goal, minus what moving the
 * thread to it would cost: a cold prompt cache, a fresh provider baseline, and
 * chat a handoff cannot carry. A new chat pays none of that, so it routes
 * freely; a long warm chat stays put unless the task or quota demands a move.
 *
 * @module autoRouter
 */
import type {
  ModelCapabilities,
  ModelSelection,
  ProviderInstanceId,
  ProviderOptionSelection,
  ServerProviderUsageLimits,
  ServerProviderUsageWindow,
} from "@t3tools/contracts";
import { AutoRoutePreference } from "@t3tools/contracts/settings";

import { classifyTask, type AutoRouteTaskSize } from "./autoRouterTask.ts";
export { classifyTask, type AutoRouteTaskSize } from "./autoRouterTask.ts";

import { elapsedShare } from "./usageLimits.ts";
import {
  forecastWindowUsedPercentAtReset,
  type UsageHistoryProfile,
  type UsageObservationPoint,
} from "./usageForecast.ts";

export type { AutoRoutePreference };
export type { UsageHistoryProfile, UsageObservationPoint };

const AUTO_ROUTE_PREFERENCE_LABELS: Record<AutoRoutePreference, string> = {
  balanced: "Balanced",
  cost: "Lowest cost",
  quality: "Best quality",
  speed: "Fastest",
};

/** 1 (worst) to 5 (best) on each axis. `economy` 5 means cheapest. */
export interface ModelRouteProfile {
  readonly quality: number;
  readonly speed: number;
  readonly economy: number;
  /** False when the slug matched no known family and the profile is a guess. */
  readonly known: boolean;
}

export interface AutoRouteModel {
  readonly slug: string;
  readonly name: string;
  readonly capabilities?: ModelCapabilities | null | undefined;
  readonly isLegacy?: boolean | undefined;
  readonly inputCostPerMillionTokens?: number | undefined;
  readonly outputCostPerMillionTokens?: number | undefined;
}

export interface AutoRouteCandidate {
  readonly instanceId: ProviderInstanceId;
  readonly driverKind: string;
  readonly label: string;
  readonly continuationGroupKey?: string | undefined;
  readonly usageLimits?: ServerProviderUsageLimits | undefined;
  readonly usageHistory?: UsageHistoryProfile | ReadonlyArray<UsageObservationPoint> | undefined;
  readonly models: ReadonlyArray<AutoRouteModel>;
}

/** What the thread holds now. Absent for a new chat, where nothing is cached yet. */
export interface AutoRouteThreadState {
  /** Tokens the current provider reported for the whole context, baseline included. */
  readonly contextTokens: number;
  /** Driver holding that context, for its cache lifetime and baseline size. */
  readonly driverKind: string;
  /** When the provider last reported usage; its cache is warm until the lifetime passes. */
  readonly lastActivityAt: number | null;
}

export interface AutoRouteInput {
  readonly preference: AutoRoutePreference;
  readonly prompt: string;
  readonly candidates: ReadonlyArray<AutoRouteCandidate>;
  /** The thread's last concrete selection. */
  readonly current?: ModelSelection | null | undefined;
  readonly thread?: AutoRouteThreadState | undefined;
  /** Benchmark-measured profiles that override the family guesses. */
  readonly profiles?: BenchmarkRouteProfiles | undefined;
  readonly attachmentCount?: number | undefined;
  readonly planMode?: boolean | undefined;
  readonly now: number;
  /** Prefer another capable account when any reported window reaches this percentage. */
  readonly quotaBlockPercent?: number | undefined;
}

export interface AutoRouteDecision {
  readonly modelSelection: ModelSelection;
  readonly providerLabel: string;
  readonly modelName: string;
  readonly task: AutoRouteTaskSize;
  /** True when the turn leaves the thread's current model. */
  readonly switched: boolean;
  /** One short sentence for the composer, e.g. "Light task, lowest cost". */
  readonly reason: string;
}

// Ordered: the first matching family wins. Tiers are relative, judged per
// family generation, and only need to rank models against each other.
const MODEL_FAMILIES: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly profile: Omit<ModelRouteProfile, "known">;
}> = [
  // Anthropic
  { pattern: /fable/, profile: { quality: 5, speed: 2, economy: 1 } },
  { pattern: /opus/, profile: { quality: 5, speed: 2, economy: 1 } },
  { pattern: /sonnet/, profile: { quality: 4, speed: 3, economy: 3 } },
  { pattern: /haiku/, profile: { quality: 2, speed: 5, economy: 5 } },
  // OpenAI: Sol is the flagship, Luna the light model used for text generation.
  { pattern: /\b(nano)\b|-nano/, profile: { quality: 1, speed: 5, economy: 5 } },
  { pattern: /\bmini\b|-mini/, profile: { quality: 2, speed: 5, economy: 5 } },
  { pattern: /luna/, profile: { quality: 2, speed: 5, economy: 5 } },
  { pattern: /astra|terra/, profile: { quality: 4, speed: 3, economy: 3 } },
  { pattern: /sol\b|-sol|codex-max/, profile: { quality: 5, speed: 2, economy: 2 } },
  // Google: Flash variants carry their effort in the slug.
  { pattern: /flash.*-low|flash-lite/, profile: { quality: 2, speed: 5, economy: 5 } },
  { pattern: /flash.*-medium/, profile: { quality: 3, speed: 4, economy: 4 } },
  { pattern: /flash/, profile: { quality: 3, speed: 4, economy: 4 } },
  { pattern: /gemini.*pro/, profile: { quality: 5, speed: 2, economy: 2 } },
  // Open models commonly reached through OpenRouter or OpenCode.
  { pattern: /deepseek.*(r1|reasoner)/, profile: { quality: 4, speed: 2, economy: 4 } },
  { pattern: /deepseek|qwen|llama|mistral/, profile: { quality: 3, speed: 4, economy: 5 } },
  { pattern: /gpt-4o|gpt-4\.1/, profile: { quality: 3, speed: 4, economy: 3 } },
  { pattern: /^openrouter\/free$/, profile: { quality: 3, speed: 3, economy: 5 } },
];

// Finer quality order for the Quality list, where the 1 to 5 tiers tie (Opus,
// Fable, Sol and Gemini Pro are all 5). First match wins; newer versions of a
// family rank above older ones via `versionBonus`.
const QUALITY_RANK: ReadonlyArray<{ readonly pattern: RegExp; readonly rank: number }> = [
  { pattern: /opus/, rank: 100 },
  { pattern: /fable/, rank: 98 },
  { pattern: /sol\b|-sol|codex-max/, rank: 96 },
  { pattern: /gemini.*pro/, rank: 94 },
  { pattern: /sonnet/, rank: 88 },
  { pattern: /astra/, rank: 84 },
  { pattern: /terra/, rank: 84 },
  { pattern: /deepseek.*(r1|reasoner)/, rank: 76 },
  { pattern: /gpt-4o/, rank: 70 },
  { pattern: /gpt-4\.1/, rank: 70 },
  { pattern: /flash/, rank: 64 },
  { pattern: /deepseek/, rank: 60 },
  { pattern: /qwen/, rank: 60 },
  { pattern: /llama/, rank: 60 },
  { pattern: /mistral/, rank: 60 },
  { pattern: /haiku/, rank: 40 },
  { pattern: /luna/, rank: 40 },
  { pattern: /mini/, rank: 40 },
  { pattern: /nano/, rank: 40 },
];

/** Position on the Quality list; larger is better. Unknown models sit mid-field. */
function qualityRank(slug: string): number {
  const normalized = slug.toLowerCase();
  const family = QUALITY_RANK.find((entry) => entry.pattern.test(normalized));
  const version = /(\d+)(?:[-.](\d+))?/.exec(normalized.replace(/^.*?(?=\d)/, ""));
  // Bound even date-like versions (2512, 2603) below 1 point so they cannot
  // outrank a stronger family. The bonus still grows with the version.
  const versionNumber = version ? Number(version[1]) + Number(version[2] ?? 0) / 10 : 0;
  const versionBonus = versionNumber / (versionNumber + 1);
  return (family?.rank ?? 50) + versionBonus;
}

const UNKNOWN_PROFILE: ModelRouteProfile = { quality: 3, speed: 3, economy: 3, known: false };

// Slugs that defer the choice to the provider's own default; nothing to rank.
const PROVIDER_DEFAULT_SLUGS = new Set(["auto", "default", "antigravity-default"]);

// Billed per token from the user's own key rather than a prepaid subscription.
export const METERED_DRIVERS: ReadonlySet<string> = new Set(["openrouter", "opencode", "pi"]);

/**
 * Measured profiles keyed by model slug (see `benchmarkRouteProfiles`). When a
 * slug is present it replaces the family guess below; others keep the guess.
 */
export type BenchmarkRouteProfiles = ReadonlyMap<string, ModelRouteProfile>;

export function profileModel(slug: string, measured?: BenchmarkRouteProfiles): ModelRouteProfile {
  const fromBenchmarks = measured?.get(slug);
  if (fromBenchmarks) return fromBenchmarks;
  const normalized = slug.toLowerCase();
  const family = MODEL_FAMILIES.find((entry) => entry.pattern.test(normalized));
  return family ? { ...family.profile, known: true } : UNKNOWN_PROFILE;
}

// ---------------------------------------------------------------------------
// Subscription quota
// ---------------------------------------------------------------------------

const HOUR = 60 * 60 * 1000;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export interface QuotaOutlook {
  /** 0 while every window should last until it resets, up to 1 when one will run dry. */
  readonly scarcity: number;
  /** 0 to 1: how much of the tightest window is projected to expire unused. */
  readonly spare: number;
}

/**
 * Where the window will stand at reset if this account keeps the pace it has
 * used so far in the window. Null when the window's length or reset is
 * unknown, or it is too early in the window to tell a pace from a burst.
 */
export function projectUsedPercentAtReset(
  window: ServerProviderUsageWindow,
  now: number,
  history?: UsageHistoryProfile | ReadonlyArray<UsageObservationPoint>,
): number | null {
  if (window.projectedUsedPercentAtReset !== undefined) {
    return window.projectedUsedPercentAtReset;
  }
  if (history !== undefined) {
    return forecastWindowUsedPercentAtReset(window, now, history);
  }
  const elapsed = elapsedShare(window, now);
  if (elapsed === null || elapsed < 0.1 || window.windowDurationMins === undefined) return null;
  const resetsAt = window.resetsAt === undefined ? Number.NaN : Date.parse(window.resetsAt);
  if (!Number.isFinite(resetsAt)) return null;
  const elapsedHours = (elapsed * window.windowDurationMins * 60_000) / HOUR;
  const hoursLeft = Math.max(0, (resetsAt - now) / HOUR);
  return window.usedPercent + (window.usedPercent / elapsedHours) * hoursLeft;
}

/**
 * Quota left at reset is lost, so an account projected to finish well under
 * its limit is the cheapest place to send work even when its percentage looks
 * high, and one projected to run dry before reset is the dearest. Null when a
 * window is already exhausted.
 */
function quotaOutlook(
  limits: ServerProviderUsageLimits | undefined,
  now: number,
  history?: UsageHistoryProfile | ReadonlyArray<UsageObservationPoint>,
): QuotaOutlook | null {
  if (!limits || limits.windows.length === 0) return { scarcity: 0, spare: 0 };
  let scarcity = 0;
  let spare = 1;
  for (const window of limits.windows) {
    if (window.usedPercent >= 100) return null;
    const projected = projectUsedPercentAtReset(window, now, history) ?? window.usedPercent;
    scarcity = Math.max(scarcity, clamp01((projected - 90) / 10));
    // Keep a ten-point margin for this thread's own work before calling quota spare.
    spare = Math.min(spare, clamp01((90 - projected) / 30));
  }
  return { scarcity, spare };
}

// ---------------------------------------------------------------------------
// Prompt cache and handoff
// ---------------------------------------------------------------------------

/**
 * Measured from local Claude Code and Codex transcripts: both keep a context
 * warm for about an hour between turns, and a fresh session reads a large
 * fixed baseline (system prompt, tools, project instructions) before any chat.
 * Read and write are multiples of the uncached input price; the prompt cache
 * is per model, so another model on the same provider starts cold.
 */
const CACHE_PROFILES: Record<
  string,
  { ttlMs: number; baselineTokens: number; read: number; write: number }
> = {
  claudeAgent: { ttlMs: HOUR, baselineTokens: 65_000, read: 0.1, write: 1.25 },
  codex: { ttlMs: HOUR, baselineTokens: 25_000, read: 0.1, write: 1 },
};
const DEFAULT_CACHE_PROFILE = { ttlMs: 5 * 60_000, baselineTokens: 20_000, read: 0.25, write: 1 };
const cacheProfile = (driverKind: string) => CACHE_PROFILES[driverKind] ?? DEFAULT_CACHE_PROFILE;
// Convert live OpenRouter prices into the existing cache-switch score units.
const SONNET_REFERENCE_INPUT_PRICE_PER_MILLION_TOKENS_USD = 3;

/** Matches the server's `DEFAULT_HANDOFF_TOKEN_CAP`: a provider switch carries at most this much chat. */
const HANDOFF_TOKEN_CAP = 16_000;

// Relative input price by economy tier, Sonnet-class = 1.
const PRICE_INDEX: Record<number, number> = { 1: 2.5, 2: 1.7, 3: 1, 4: 0.6, 5: 0.33 };

const chatTokens = (thread: AutoRouteThreadState) =>
  Math.max(0, thread.contextTokens - cacheProfile(thread.driverKind).baselineTokens);

/**
 * Input the next turn pays, in Sonnet-priced token equivalents. The same warm
 * model reads its cache; a cold cache or another model on the same provider
 * re-reads the whole context; another provider reads its own baseline plus at
 * most the handoff cap of chat.
 */
function nextTurnInputCost(input: {
  readonly thread: AutoRouteThreadState;
  readonly driverKind: string;
  readonly profile: ModelRouteProfile;
  readonly inputCostPerMillionTokens?: number | undefined;
  readonly sameProviderSession: boolean;
  readonly sameModel: boolean;
  readonly now: number;
}): number {
  const { thread } = input;
  const target = cacheProfile(input.driverKind);
  const price =
    input.inputCostPerMillionTokens === undefined
      ? (PRICE_INDEX[input.profile.economy] ?? 1)
      : input.inputCostPerMillionTokens / SONNET_REFERENCE_INPUT_PRICE_PER_MILLION_TOKENS_USD;
  if (input.sameProviderSession) {
    const warm =
      thread.lastActivityAt !== null &&
      input.now - thread.lastActivityAt < cacheProfile(thread.driverKind).ttlMs;
    return thread.contextTokens * (input.sameModel && warm ? target.read : target.write) * price;
  }
  return (
    (target.baselineTokens + Math.min(chatTokens(thread), HANDOFF_TOKEN_CAP)) * target.write * price
  );
}

/** Share of the chat a provider switch would leave behind, 0 to 1. */
export function handoffContextLoss(thread: AutoRouteThreadState): number {
  const chat = chatTokens(thread);
  return chat <= HANDOFF_TOKEN_CAP ? 0 : 1 - HANDOFF_TOKEN_CAP / chat;
}

// Score points per 1,000 Sonnet-priced input tokens a move costs beyond staying.
const SWITCH_TOKEN_WEIGHT: Record<AutoRoutePreference, number> = {
  balanced: 0.04,
  cost: 0.06,
  quality: 0.003,
  speed: 0.03,
};
// Any move on a running thread must beat staying by this much, so near ties
// do not bounce a thread between models turn after turn.
const SWITCH_MARGIN = 1;

// Score points for leaving the whole chat behind in a handoff.
const CONTEXT_LOSS_WEIGHT: Record<AutoRoutePreference, number> = {
  balanced: 2.5,
  cost: 1.5,
  quality: 4,
  speed: 2,
};

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

// How much each axis counts, per preference. Quality always counts a little
// and is floored by task size below, so "cost" never routes a heavy task to a
// model that cannot do it.
const WEIGHTS: Record<AutoRoutePreference, { quality: number; speed: number; economy: number }> = {
  balanced: { quality: 1, speed: 0.6, economy: 0.8 },
  cost: { quality: 0.4, speed: 0.3, economy: 1.6 },
  quality: { quality: 2.5, speed: 0.1, economy: 0.1 },
  speed: { quality: 0.5, speed: 1.6, economy: 0.4 },
};

const QUALITY_FLOOR: Record<AutoRouteTaskSize, number> = { light: 1, standard: 3, heavy: 4 };
// Quality above what the task needs is worth less, except when quality is the goal.
const QUALITY_CEILING: Record<AutoRouteTaskSize, number> = { light: 3, standard: 4, heavy: 5 };

const EFFORT_BY_TASK: Record<AutoRouteTaskSize, ReadonlyArray<string>> = {
  light: ["low"],
  standard: [],
  heavy: ["high"],
};

/** Effort suited to the task, only when the model offers that exact choice. */
function effortOptions(
  model: AutoRouteModel,
  task: AutoRouteTaskSize,
  preference: AutoRoutePreference,
): ReadonlyArray<ProviderOptionSelection> | undefined {
  const wanted = preference === "quality" && task !== "light" ? ["high"] : EFFORT_BY_TASK[task];
  if (wanted.length === 0) return undefined;
  const descriptor = model.capabilities?.optionDescriptors?.find(
    (option) => option.id === "effort" && option.type === "select",
  );
  if (descriptor?.type !== "select") return undefined;
  const choice = wanted.find((id) => descriptor.options.some((option) => option.id === id));
  return choice ? [{ id: "effort", value: choice }] : undefined;
}

function modelEconomy(input: {
  readonly model: AutoRouteModel;
  readonly profile: ModelRouteProfile;
  readonly task: AutoRouteTaskSize;
  readonly driverKind: string;
}) {
  const outputShare = input.task === "heavy" ? 0.3 : input.task === "light" ? 0.15 : 0.2;
  const inputPrice = input.model.inputCostPerMillionTokens;
  const outputPrice = input.model.outputCostPerMillionTokens;
  const estimatedPricePerMillionTokens =
    inputPrice === undefined && outputPrice === undefined
      ? undefined
      : (inputPrice ?? outputPrice ?? 0) * (1 - outputShare) +
        (outputPrice ?? inputPrice ?? 0) * outputShare;
  // Actual OpenRouter rates replace the old blanket metered penalty. When a
  // provider has no rate metadata, retain the conservative fallback.
  const economyBeforeQuota =
    estimatedPricePerMillionTokens === undefined
      ? input.profile.economy - (METERED_DRIVERS.has(input.driverKind) ? 2 : 0)
      : estimatedPricePerMillionTokens === 0
        ? 5
        : 5 - Math.log10(Math.max(estimatedPricePerMillionTokens, 0.01) / 0.01);
  return { economyBeforeQuota, estimatedPricePerMillionTokens };
}

/** Fit for the task and goal, ignoring where the thread is now. */
function fitScore(input: {
  readonly model: AutoRouteModel;
  readonly profile: ModelRouteProfile;
  readonly preference: AutoRoutePreference;
  readonly task: AutoRouteTaskSize;
  readonly driverKind: string;
  readonly outlook: QuotaOutlook;
  readonly isLegacy: boolean;
}): number {
  const weights = WEIGHTS[input.preference];
  const effectiveQuality =
    input.preference === "quality"
      ? input.profile.quality
      : Math.min(input.profile.quality, QUALITY_CEILING[input.task]);
  const { economyBeforeQuota, estimatedPricePerMillionTokens } = modelEconomy(input);
  const economy = Math.max(
    1,
    Math.min(
      5,
      economyBeforeQuota +
        (estimatedPricePerMillionTokens === undefined && !METERED_DRIVERS.has(input.driverKind)
          ? input.outlook.spare
          : 0) -
        input.outlook.scarcity * 3,
    ),
  );
  let score =
    weights.quality * effectiveQuality +
    weights.speed * input.profile.speed +
    weights.economy * economy;
  const floor = QUALITY_FLOOR[input.task];
  const shortfall = floor - input.profile.quality;
  if (shortfall > 0) score -= shortfall * 4;
  if (!input.profile.known) score -= 0.5;
  if (input.isLegacy) score -= 1;
  return score;
}

export interface RankedRouteModel {
  readonly instanceId: ProviderInstanceId;
  readonly providerLabel: string;
  readonly slug: string;
  readonly name: string;
  readonly profile: ModelRouteProfile;
  /** Both token prices are zero, e.g. an OpenRouter free model. */
  readonly free: boolean;
}

/**
 * Every runnable model ordered best-first for one goal, for the picker's
 * ranked list. Scores a standard-size task (light for speed) so the goal decides the order;
 * accounts with an exhausted quota window are left out. Cost lists free models
 * first, since the user asks for what costs nothing right now. Quality keeps
 * one recommendation per family, preferring a subscription when models tie.
 */
export function rankModelsForPreference(input: {
  readonly preference: AutoRoutePreference;
  readonly candidates: ReadonlyArray<AutoRouteCandidate>;
  readonly now: number;
  readonly limit?: number | undefined;
  readonly profiles?: BenchmarkRouteProfiles | undefined;
}): ReadonlyArray<RankedRouteModel> {
  const ranked: Array<RankedRouteModel & { readonly score: number; readonly metered: boolean }> =
    [];
  for (const candidate of input.candidates) {
    const outlook = quotaOutlook(candidate.usageLimits, input.now, candidate.usageHistory);
    if (outlook === null) continue;
    for (const model of candidate.models) {
      if (PROVIDER_DEFAULT_SLUGS.has(model.slug) && candidate.models.length > 1) continue;
      const profile = profileModel(model.slug, input.profiles);
      const free = model.inputCostPerMillionTokens === 0 && model.outputCostPerMillionTokens === 0;
      const base = fitScore({
        model,
        profile,
        preference: input.preference,
        // A speed list must not drop small fast models for missing a quality floor.
        task: input.preference === "speed" ? "light" : "standard",
        driverKind: candidate.driverKind,
        outlook,
        isLegacy: model.isLegacy === true,
      });
      // Break goal ties on the goal's own axis so the list reads as a ranking.
      const axis =
        input.preference === "speed"
          ? profile.speed
          : input.preference === "quality"
            ? profile.quality
            : input.preference === "cost"
              ? profile.economy
              : 0;
      ranked.push({
        instanceId: candidate.instanceId,
        providerLabel: candidate.label,
        slug: model.slug,
        name: model.name,
        profile,
        free,
        metered: METERED_DRIVERS.has(candidate.driverKind),
        score:
          input.preference === "quality"
            ? qualityRank(model.slug) - (model.isLegacy === true ? 0.5 : 0)
            : base + axis * 0.01 + (input.preference === "cost" && free ? 100 : 0),
      });
    }
  }
  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      (input.preference === "quality" ? Number(a.metered) - Number(b.metered) : 0) ||
      a.name.localeCompare(b.name),
  );
  const seenFamilies = new Set<string>();
  const recommendations =
    input.preference === "quality"
      ? ranked.filter((entry) => {
          const slug = entry.slug.toLowerCase();
          const family = QUALITY_RANK.find((candidate) => candidate.pattern.test(slug));
          // Unknown models keep separate slots; don't guess their family.
          const key = family?.pattern.source ?? slug.replace(/^[^/]+\//, "").replace(/:batch$/, "");
          if (seenFamilies.has(key)) return false;
          seenFamilies.add(key);
          return true;
        })
      : ranked;
  return recommendations
    .slice(0, input.limit ?? 5)
    .map(({ score: _score, metered: _metered, ...entry }) => entry);
}

interface ScoredOption {
  readonly economy: number;
  readonly candidate: AutoRouteCandidate;
  readonly model: AutoRouteModel;
  readonly fit: number;
  /** Next-turn input in thousands of Sonnet-priced tokens, 0 for a new chat. */
  readonly inputCost: number;
  readonly contextLoss: number;
  readonly isCurrent: boolean;
  readonly quality: number;
  readonly scarcity: number;
}

/** Null when no candidate can run the turn (every account is out of quota). */
export function routeTurn(input: AutoRouteInput): AutoRouteDecision | null {
  const task = classifyTask(input);
  const current = input.current ?? null;
  const currentGroup = input.candidates.find(
    (candidate) => candidate.instanceId === current?.instanceId,
  )?.continuationGroupKey;
  // A started thread whose usage has not been reported yet is treated as a
  // warm one of moderate length, so the router does not move blind.
  const currentDriver = input.candidates.find(
    (candidate) => candidate.instanceId === current?.instanceId,
  )?.driverKind;
  const thread: AutoRouteThreadState | undefined = !current
    ? undefined
    : (input.thread ?? {
        contextTokens: cacheProfile(currentDriver ?? "").baselineTokens + 2 * HANDOFF_TOKEN_CAP,
        driverKind: currentDriver ?? "",
        lastActivityAt: input.now,
      });

  const options: ScoredOption[] = [];
  for (const candidate of input.candidates) {
    const outlook = quotaOutlook(candidate.usageLimits, input.now, candidate.usageHistory);
    if (outlook === null) continue;
    // Instances sharing a continuation group resume the same native session.
    const sameProviderSession =
      candidate.instanceId === current?.instanceId ||
      (currentGroup !== undefined && candidate.continuationGroupKey === currentGroup);
    for (const model of candidate.models) {
      if (PROVIDER_DEFAULT_SLUGS.has(model.slug) && candidate.models.length > 1) continue;
      const profile = profileModel(model.slug, input.profiles);
      const isCurrent = sameProviderSession && model.slug === current?.model;
      options.push({
        economy: modelEconomy({ model, profile, task, driverKind: candidate.driverKind })
          .economyBeforeQuota,
        candidate,
        model,
        isCurrent,
        quality: profile.quality,
        scarcity: outlook.scarcity,
        fit: fitScore({
          model,
          profile,
          preference: input.preference,
          task,
          driverKind: candidate.driverKind,
          outlook,
          isLegacy: model.isLegacy === true,
        }),
        inputCost: thread
          ? nextTurnInputCost({
              thread,
              driverKind: candidate.driverKind,
              profile,
              inputCostPerMillionTokens: model.inputCostPerMillionTokens,
              sameProviderSession,
              sameModel: isCurrent,
              now: input.now,
            }) / 1000
          : 0,
        contextLoss: thread && !sameProviderSession ? handoffContextLoss(thread) : 0,
      });
    }
  }
  if (options.length === 0) return null;

  const capable = options.filter((option) => option.quality >= QUALITY_FLOOR[task]);
  const bestQuality = options.reduce((quality, option) => Math.max(quality, option.quality), 0);
  // When no capable model can run, keep the strongest available fallback.
  const qualityOptions =
    capable.length > 0 ? capable : options.filter((option) => option.quality === bestQuality);
  const threshold = input.quotaBlockPercent ?? 90;
  const belowThreshold = qualityOptions.filter(
    (option) =>
      !option.candidate.usageLimits?.windows.some((window) => window.usedPercent >= threshold),
  );
  const avoidedLimit = belowThreshold.length > 0 && belowThreshold.length < qualityOptions.length;
  const eligible = belowThreshold.length > 0 ? belowThreshold : qualityOptions;

  // A warm thread never steps down to a weaker model for a lighter prompt: the
  // move re-reads the whole context, and the next normal prompt would move it
  // back. It steps down only once the cache is cold or its account runs low.
  const stay = eligible.find((option) => option.isCurrent);
  const warm =
    thread !== undefined &&
    thread.lastActivityAt !== null &&
    input.now - thread.lastActivityAt < cacheProfile(thread.driverKind).ttlMs;
  const allowed =
    stay && warm && stay.scarcity < 0.5
      ? eligible.filter((option) => option.isCurrent || option.quality >= stay.quality)
      : eligible;

  // A move pays only what it costs beyond staying. When the current model
  // cannot run, every option pays its own next-turn input.
  const stayCost = stay?.inputCost ?? 0;
  const total = (option: ScoredOption) =>
    option.fit -
    Math.max(0, option.inputCost - stayCost) * SWITCH_TOKEN_WEIGHT[input.preference] -
    option.contextLoss * CONTEXT_LOSS_WEIGHT[input.preference] -
    (thread && !option.isCurrent ? SWITCH_MARGIN : 0);
  const best = allowed.reduce((a, b) =>
    input.preference === "cost" && !thread && a.economy !== b.economy
      ? b.economy > a.economy
        ? b
        : a
      : total(b) > total(a)
        ? b
        : a,
  );
  const bestFit = options.reduce((a, b) => (b.fit > a.fit ? b : a));

  const switched = current !== null && !best.isCurrent;
  const keptForCache = best.isCurrent && bestFit !== best;
  // Changing thinking effort mid-thread invalidates the cached messages, so
  // the current model keeps its options and effort is only chosen on a move.
  const modelOptions = best.isCurrent
    ? current?.options
    : effortOptions(best.model, task, input.preference);
  return {
    modelSelection: {
      instanceId: best.candidate.instanceId,
      model: best.model.slug,
      ...(modelOptions ? { options: modelOptions } : {}),
    },
    providerLabel: best.candidate.label,
    modelName: best.model.name,
    task,
    switched,
    reason: `${TASK_LABELS[task]} task, ${AUTO_ROUTE_PREFERENCE_LABELS[input.preference].toLowerCase()}${avoidedLimit ? `, kept below ${threshold}% account limit` : ""}${keptForCache ? ", stayed to keep the cache warm" : ""}`,
  };
}

const TASK_LABELS: Record<AutoRouteTaskSize, string> = {
  light: "Light",
  standard: "Standard",
  heavy: "Heavy",
};
