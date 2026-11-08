import type { OrchestrationV2ProviderTurn, OrchestrationV2TurnItem } from "@t3tools/contracts";
import {
  buildTurnLedger,
  detectCacheBreak,
  type CacheBreak,
  type TurnLedger,
} from "@t3tools/shared/turnLedger";
import * as DateTime from "effect/DateTime";

export interface ToolStepSummary {
  readonly id: string;
  readonly type: string;
  readonly label: string;
  readonly durationMs: number;
  readonly status: string;
}

export interface VelocitySummary {
  /** Where the latest reporting turn's tokens went; null until a turn reports input. */
  readonly ledger: TurnLedger | null;
  /** Set when the prompt prefix changed and the cache restarted; null otherwise. */
  readonly cacheBreak: CacheBreak | null;
  readonly outputTokens: number | null;
  readonly reasoningTokens: number | null;
  readonly isLive: boolean;
  /** Output over the whole turn, tool waits included. */
  readonly averageTurnTps: number | null;
  /** Output over the turn minus tool waits: the closest honest proxy for model stream speed. */
  readonly modelStreamTps: number | null;
  readonly turnDurationMs: number | null;
  readonly toolWaitMs: number | null;
  /** Turn start to the first thinking or text item; includes request and queue overhead. */
  readonly firstOutputMs: number | null;
  readonly rolling5Tps: number | null;
  readonly rolling10Tps: number | null;
  readonly rolling20Tps: number | null;
  readonly avgToolDurationMs: number | null;
  readonly recentToolSteps: ReadonlyArray<ToolStepSummary>;
  readonly tpsHistory: ReadonlyArray<number>;
  readonly totalTurnsTracked: number;
  readonly totalToolCallsTracked: number;
}

export interface TurnSpeedSample {
  readonly turnId: string;
  readonly durationMs: number;
  readonly outputTokens: number;
  readonly tps: number;
  readonly timestamp: number;
}

function parseTimestamp(timestamp: unknown): number | null {
  if (!timestamp) return null;
  if (typeof timestamp === "string") {
    const ms = Date.parse(timestamp);
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof timestamp === "object" && timestamp !== null) {
    try {
      return DateTime.toEpochMillis(timestamp as DateTime.Utc);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Extracts a turn's output token total. Only provider turn totals count: `tokenUsage` describes
 * one response's context window, so dividing it by the whole turn's elapsed time understates
 * speed and made the headline number disagree with the rolling averages.
 */
export function extractTurnOutputTokens(
  turn: OrchestrationV2ProviderTurn | null | undefined,
): number {
  const outputTokens = turn?.turnTokenUsage?.outputTokens;
  return typeof outputTokens === "number" ? outputTokens : 0;
}

/**
 * Calculates tokens per second for a single turn.
 * Duration must be positive (>= 50ms) to avoid divide-by-zero or flash artifacts.
 */
export function calculateTurnVelocity(
  turn: OrchestrationV2ProviderTurn | null | undefined,
): number | null {
  if (!turn || !turn.startedAt || !turn.completedAt) return null;

  const startMs = parseTimestamp(turn.startedAt);
  const endMs = parseTimestamp(turn.completedAt);
  if (startMs === null || endMs === null) return null;

  const durationMs = endMs - startMs;
  if (durationMs < 50) return null;

  const outputTokens = extractTurnOutputTokens(turn);
  if (outputTokens <= 0) return null;

  const tps = (outputTokens / durationMs) * 1000;
  return Number.isFinite(tps) ? Math.round(tps * 10) / 10 : null;
}

/**
 * Calculates weighted rolling tokens per second over exactly the last N valid turns.
 * Returns null when fewer than N turns exist; callers pass min(N, turns) for a partial window.
 * Weighted by total tokens / total duration to avoid bias from 1-token turns.
 * Hermes compatible (no ES2023 array mutation methods).
 */
export function calculateRollingVelocity(
  samples: ReadonlyArray<TurnSpeedSample>,
  windowSize: number,
): number | null {
  if (windowSize <= 0 || samples.length < windowSize) return null;

  const slice = samples.slice(samples.length - windowSize);

  let totalTokens = 0;
  let totalDurationMs = 0;

  for (let i = 0; i < slice.length; i++) {
    const s = slice[i]!;
    totalTokens += s.outputTokens;
    totalDurationMs += s.durationMs;
  }

  if (totalDurationMs < 100 || totalTokens <= 0) return null;
  const tps = (totalTokens / totalDurationMs) * 1000;
  return Number.isFinite(tps) ? Math.round(tps * 10) / 10 : null;
}

/**
 * Checks if a turn item represents an active tool call or system action.
 */
function isToolCallItem(item: OrchestrationV2TurnItem): boolean {
  return (
    item.type === "command_execution" ||
    item.type === "file_change" ||
    item.type === "dynamic_tool" ||
    item.type === "file_search" ||
    item.type === "web_search"
  );
}

function isTurnWaitItem(item: OrchestrationV2TurnItem): boolean {
  return (
    isToolCallItem(item) ||
    item.type === "user_input_request" ||
    item.type === "approval_request" ||
    item.type === "secret_request" ||
    item.type === "subagent"
  );
}

/**
 * Formats a clean human-readable title for a tool call item.
 */
function formatToolItemLabel(item: OrchestrationV2TurnItem): string {
  if (item.title) return item.title;
  switch (item.type) {
    case "command_execution":
      return item.input.slice(0, 32);
    case "file_change":
      return item.fileName;
    case "file_search":
      return item.pattern ? `grep ${item.pattern}` : "file search";
    case "web_search":
      return "web search";
    default:
      return item.type;
  }
}

/**
 * Analyzes recent turn items to extract tool execution latency.
 */
export function analyzeToolCallCadence(
  items: ReadonlyArray<OrchestrationV2TurnItem> | undefined,
  maxItems = 10,
): {
  readonly avgToolDurationMs: number | null;
  readonly recentTools: ReadonlyArray<ToolStepSummary>;
  readonly totalTools: number;
} {
  if (!items || items.length === 0) {
    return { avgToolDurationMs: null, recentTools: [], totalTools: 0 };
  }

  const toolSummaries: ToolStepSummary[] = [];
  let totalDuration = 0;
  let validDurationCount = 0;

  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    if (!isToolCallItem(it)) continue;

    let durationMs = 0;
    if (it.startedAt && it.completedAt) {
      const s = parseTimestamp(it.startedAt);
      const e = parseTimestamp(it.completedAt);
      if (s !== null && e !== null && e >= s) {
        durationMs = e - s;
        totalDuration += durationMs;
        validDurationCount++;
      }
    }

    toolSummaries.push({
      id: it.id,
      type: it.type,
      label: formatToolItemLabel(it),
      durationMs,
      status: it.status,
    });
  }

  const avgToolDurationMs =
    validDurationCount > 0 ? Math.round(totalDuration / validDurationCount) : null;

  // Last N items (most recent first)
  const recentSlice = toolSummaries.slice(-maxItems);
  const recentReversed = [...recentSlice].reverse();

  return {
    avgToolDurationMs,
    recentTools: recentReversed,
    totalTools: toolSummaries.length,
  };
}

/**
 * Splits one turn window into tool wait and first-output delay. Overlapping tool calls count once,
 * a call with no end is clipped to the window end, and only this turn's items count. Stream
 * timestamps are item-level, so rates built on this are approximations, not token-level timings.
 */
function measureTurnTiming(
  turnId: string,
  items: ReadonlyArray<OrchestrationV2TurnItem>,
  startMs: number,
  endMs: number,
): { readonly toolWaitMs: number; readonly firstOutputMs: number | null } {
  const spans: Array<[number, number]> = [];
  let firstOutputAt: number | null = null;
  for (const item of items) {
    if (item.providerTurnId !== turnId) continue;
    const itemStart = parseTimestamp(item.startedAt);
    if (itemStart === null) continue;
    if (item.type === "assistant_message" || item.type === "reasoning") {
      firstOutputAt = firstOutputAt === null ? itemStart : Math.min(firstOutputAt, itemStart);
      continue;
    }
    if (!isTurnWaitItem(item)) continue;
    const from = Math.max(itemStart, startMs);
    const to = Math.min(parseTimestamp(item.completedAt) ?? endMs, endMs);
    if (to > from) spans.push([from, to]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  let toolWaitMs = 0;
  let coveredUntil = startMs;
  for (const [from, to] of spans) {
    if (to <= coveredUntil) continue;
    toolWaitMs += to - Math.max(from, coveredUntil);
    coveredUntil = to;
  }
  return {
    toolWaitMs,
    firstOutputMs: firstOutputAt === null ? null : Math.max(0, firstOutputAt - startMs),
  };
}

/** Uses the newest turns that reported input, so a fresh live turn does not blank the ledger. */
function deriveLedgers(turns: ReadonlyArray<OrchestrationV2ProviderTurn>): {
  readonly ledger: TurnLedger | null;
  readonly cacheBreak: CacheBreak | null;
} {
  const ledgers: TurnLedger[] = [];
  for (let index = turns.length - 1; index >= 0 && ledgers.length < 2; index -= 1) {
    const usage = turns[index]?.turnTokenUsage;
    if (usage?.inputTokens === undefined) continue;
    if (usage.cachedInputTokens === undefined)
      return { ledger: ledgers[0] ?? null, cacheBreak: null };
    ledgers.push(
      buildTurnLedger({
        inputTokens: usage.inputTokens,
        cachedInputTokens: usage.cachedInputTokens ?? 0,
        cacheCreationTokens: usage.cacheCreationTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        reasoningOutputTokens: usage.reasoningTokens ?? 0,
      }),
    );
  }
  const [ledger = null, previous = null] = ledgers;
  return { ledger, cacheBreak: ledger ? detectCacheBreak(ledger, previous) : null };
}

/**
 * Builds the complete multi-window VelocitySummary from live provider turns & turn items.
 */
export function deriveVelocitySummary(
  turns: ReadonlyArray<OrchestrationV2ProviderTurn> | undefined,
  turnItems: ReadonlyArray<OrchestrationV2TurnItem> | undefined,
): VelocitySummary {
  if (!turns || turns.length === 0) {
    const { avgToolDurationMs, recentTools, totalTools } = analyzeToolCallCadence(turnItems);
    return {
      ledger: null,
      cacheBreak: null,
      outputTokens: null,
      reasoningTokens: null,
      isLive: false,
      averageTurnTps: null,
      modelStreamTps: null,
      turnDurationMs: null,
      toolWaitMs: null,
      firstOutputMs: null,
      rolling5Tps: null,
      rolling10Tps: null,
      rolling20Tps: null,
      avgToolDurationMs,
      recentToolSteps: recentTools,
      tpsHistory: [],
      totalTurnsTracked: 0,
      totalToolCallsTracked: totalTools,
    };
  }

  const samples: TurnSpeedSample[] = [];
  // Group once so each finished turn reads only its own items.
  const itemsByTurn = new Map<string, OrchestrationV2TurnItem[]>();
  for (const item of turnItems ?? []) {
    if (item.providerTurnId == null) continue;
    const group = itemsByTurn.get(item.providerTurnId);
    if (group) group.push(item);
    else itemsByTurn.set(item.providerTurnId, [item]);
  }

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i]!;
    if (
      (turn.status === "completed" || turn.turnTokenUsage?.usageStatus === "complete") &&
      turn.startedAt &&
      turn.completedAt
    ) {
      const startMs = parseTimestamp(turn.startedAt);
      const endMs = parseTimestamp(turn.completedAt);

      if (startMs !== null && endMs !== null) {
        const outputTokens = extractTurnOutputTokens(turn);
        // Rolling pace is model pace: time spent waiting on tools is not generation time.
        const { toolWaitMs } = measureTurnTiming(
          turn.id,
          itemsByTurn.get(turn.id) ?? [],
          startMs,
          endMs,
        );
        const durationMs = endMs - startMs - toolWaitMs;

        if (durationMs >= 50 && outputTokens > 0) {
          const tps = Math.round((outputTokens / durationMs) * 1000 * 10) / 10;
          samples.push({
            turnId: turn.id,
            durationMs,
            outputTokens,
            tps,
            timestamp: endMs,
          });
        }
      }
    }
  }

  const latestTurn = turns[turns.length - 1];
  const isLive = latestTurn?.status === "running";
  const measuredTurn = isLive
    ? latestTurn
    : turns.findLast((turn) => turn.turnTokenUsage?.outputTokens !== undefined);
  const hasOutput = measuredTurn?.turnTokenUsage?.outputTokens !== undefined;
  const outputTokens = hasOutput ? extractTurnOutputTokens(measuredTurn) : null;
  const reasoningTokens = measuredTurn?.turnTokenUsage?.reasoningTokens ?? null;
  const reportMs = parseTimestamp(measuredTurn?.tokenUsage?.updatedAt);
  const startMs = parseTimestamp(measuredTurn?.startedAt);
  const liveDurationMs = reportMs !== null && startMs !== null ? reportMs - startMs : 0;
  // Only turn aggregates measure pace; response-level context usage is never mixed in.
  // Provider counts arrive in batches. This is turn-average pace, including tool waits,
  // not an invented measurement of the model's private thinking speed.
  const averageTurnTps = isLive
    ? outputTokens !== null && liveDurationMs >= 50
      ? Math.round((outputTokens / liveDurationMs) * 1000 * 10) / 10
      : null
    : calculateTurnVelocity(measuredTurn);
  const windowEndMs = isLive ? reportMs : parseTimestamp(measuredTurn?.completedAt);
  const timing =
    measuredTurn && startMs !== null && windowEndMs !== null && windowEndMs - startMs >= 50
      ? {
          durationMs: windowEndMs - startMs,
          ...measureTurnTiming(measuredTurn.id, turnItems ?? [], startMs, windowEndMs),
        }
      : null;
  const activeMs = timing === null ? 0 : timing.durationMs - timing.toolWaitMs;
  const modelStreamTps =
    outputTokens !== null && outputTokens > 0 && activeMs >= 50
      ? Math.round((outputTokens / activeMs) * 1000 * 10) / 10
      : null;

  // A window that is not full yet averages the turns that exist; the label says how many.
  const rolling5Tps = calculateRollingVelocity(samples, Math.min(5, samples.length));
  const rolling10Tps = calculateRollingVelocity(samples, Math.min(10, samples.length));
  const rolling20Tps = calculateRollingVelocity(samples, Math.min(20, samples.length));

  const tpsHistory = samples.slice(-20).map((s) => s.tps);

  const { avgToolDurationMs, recentTools, totalTools } = analyzeToolCallCadence(turnItems);

  return {
    ...deriveLedgers(turns),
    outputTokens,
    reasoningTokens,
    isLive,
    averageTurnTps,
    modelStreamTps,
    turnDurationMs: timing?.durationMs ?? null,
    toolWaitMs: timing?.toolWaitMs ?? null,
    firstOutputMs: timing?.firstOutputMs ?? null,
    rolling5Tps,
    rolling10Tps,
    rolling20Tps,
    avgToolDurationMs,
    recentToolSteps: recentTools,
    tpsHistory,
    totalTurnsTracked: samples.length,
    totalToolCallsTracked: totalTools,
  };
}

/** "75%"; a turn that sent no input has no rate. */
/** One plain sentence for the popover when the cache restarted. */
export function formatCacheBreak(cacheBreak: CacheBreak): string {
  return `Cached share fell from ${formatCacheHitRate(cacheBreak.previousRate)} to ${formatCacheHitRate(cacheBreak.currentRate)}. ${cacheBreak.rewrittenTokens.toLocaleString()} tokens were written again.`;
}

export function formatCacheHitRate(rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return "--";
  return `${Math.round(rate * 100)}%`;
}

export function formatTpsLabel(tps: number | null): string {
  if (tps === null || !Number.isFinite(tps)) return "--";
  return `${tps.toFixed(1).replace(/\.0$/, "")} t/s`;
}

/** Window fill for a rolling average: "" when full, else "1 of 5" so a partial average reads as one. */
export function formatRollingFill(windowSize: number, turnsTracked: number): string {
  if (turnsTracked >= windowSize) return "";
  return turnsTracked === 0 ? "none yet" : `${turnsTracked} of ${windowSize}`;
}

/** "12.4s (35% of turn)"; tool wait is only known once the turn window is. */
export function formatToolWait(
  summary: Pick<VelocitySummary, "toolWaitMs" | "turnDurationMs">,
): string {
  const { toolWaitMs, turnDurationMs } = summary;
  if (toolWaitMs === null || turnDurationMs === null || turnDurationMs <= 0) return "--";
  return `${formatToolDuration(toolWaitMs)} (${Math.round((toolWaitMs / turnDurationMs) * 100)}% of the reply)`;
}

export function formatToolDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "--";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
