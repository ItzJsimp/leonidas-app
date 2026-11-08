import type { OrchestrationV2ThreadProjection } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

export type TurnPerfProjection = Pick<
  OrchestrationV2ThreadProjection,
  "runs" | "attempts" | "nodes" | "providerTurns"
>;

export interface TurnPerf {
  readonly ordinal: number;
  readonly status: string;
  readonly model: string;
  /** From the request to the start of the run. */
  readonly waitMs: number | null;
  /** From the start to the end of the run. */
  readonly totalMs: number | null;
  /** Sum of every tool call's time. Calls that overlap count twice. */
  readonly toolMs: number;
  readonly toolCalls: number;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
}

export interface TurnPerfChange {
  readonly fromOrdinal: number;
  readonly toOrdinal: number;
  /** Later run minus earlier run. A null side makes the difference null. */
  readonly totalMs: number | null;
  readonly toolMs: number;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
}

const ms = (a: DateTime.Utc | null, b: DateTime.Utc | null) =>
  a === null || b === null ? null : DateTime.toEpochMillis(b) - DateTime.toEpochMillis(a);
const minus = (later: number | null, earlier: number | null) =>
  later === null || earlier === null ? null : later - earlier;

/** The newest `limit` runs, newest first. It reads timing and counts only: never message text. */
export function turnPerf(projection: TurnPerfProjection, limit: number): ReadonlyArray<TurnPerf> {
  return projection.runs
    .toSorted((left, right) => right.ordinal - left.ordinal)
    .slice(0, limit)
    .map((run) => {
      const tools = projection.nodes.filter(
        (node) => node.runId === run.id && node.kind === "tool_call",
      );
      const turnIds = new Set(
        projection.attempts
          .filter((attempt) => attempt.runId === run.id)
          .map((attempt) => attempt.providerTurnId),
      );
      const usages = projection.providerTurns
        .filter((turn) => turnIds.has(turn.id))
        .map((turn) => ({
          input: turn.turnTokenUsage?.inputTokens ?? turn.tokenUsage?.inputTokens,
          output: turn.turnTokenUsage?.outputTokens ?? turn.tokenUsage?.outputTokens,
        }));
      const total = (pick: (usage: (typeof usages)[number]) => number | undefined) => {
        const known = usages.map(pick).filter((value): value is number => value !== undefined);
        return known.length === 0 ? null : known.reduce((sum, value) => sum + value, 0);
      };
      return {
        ordinal: run.ordinal,
        status: run.status,
        model: run.modelSelection.model,
        waitMs: ms(run.requestedAt, run.startedAt),
        totalMs: ms(run.startedAt, run.completedAt),
        toolMs: tools.reduce((sum, node) => sum + (ms(node.startedAt, node.completedAt) ?? 0), 0),
        toolCalls: tools.length,
        inputTokens: total((usage) => usage.input),
        outputTokens: total((usage) => usage.output),
      };
    });
}

/** The change from the run before the newest finished run to the newest finished run, or null. */
export function compareTurns(runs: ReadonlyArray<TurnPerf>): TurnPerfChange | null {
  const [later, earlier] = runs.filter((run) => run.status === "completed");
  if (later === undefined || earlier === undefined) return null;
  return {
    fromOrdinal: earlier.ordinal,
    toOrdinal: later.ordinal,
    totalMs: minus(later.totalMs, earlier.totalMs),
    toolMs: later.toolMs - earlier.toolMs,
    inputTokens: minus(later.inputTokens, earlier.inputTokens),
    outputTokens: minus(later.outputTokens, earlier.outputTokens),
  };
}
