import type { SubagentRunKind, SubagentRunStatus } from "@t3tools/contracts";

import type { TokenRates } from "../usage/usagePricing.ts";

/** Stored statuses that mean the subagent still holds a live run. */
export const ACTIVE_RAW_STATUSES = ["pending", "running", "waiting"];

/**
 * The page status from the stored status. `interrupted` means a stop or a restart ended the run,
 * so it reads as cancelled. `idle` means the run finished its turn and may take a follow-up.
 */
export function runStatus(raw: string): SubagentRunStatus {
  switch (raw) {
    case "pending":
    case "running":
      return "running";
    case "waiting":
      return "waiting";
    case "failed":
      return "failed";
    case "cancelled":
    case "interrupted":
      return "cancelled";
    default:
      return "done";
  }
}

/** The stored statuses that one page status covers. */
export function rawStatusesFor(status: SubagentRunStatus): string[] {
  switch (status) {
    case "running":
      return ["pending", "running"];
    case "waiting":
      return ["waiting"];
    case "failed":
      return ["failed"];
    case "cancelled":
      return ["cancelled", "interrupted"];
    case "done":
      return ["completed", "idle"];
  }
}

export function runKind(input: {
  readonly origin: string;
  readonly hasWorkflow: boolean;
  readonly persona: string | null;
}): SubagentRunKind {
  if (input.hasWorkflow) return "workflow";
  if (input.origin === "provider_native") return "native";
  return input.persona === null ? "delegated" : "persona";
}

/** One line for a list row: the title, else the first line of the task. */
export function summaryLine(title: string | null, prompt: string): string {
  const source = title?.trim() ? title : (prompt.split("\n").find((line) => line.trim()) ?? "");
  const line = source.replace(/\s+/g, " ").trim();
  if (line === "") return "Subagent task";
  return line.length > 140 ? `${line.slice(0, 139)}...` : line;
}

export function cutText(text: string, cap: number, fullLength: number) {
  return { text, truncated: fullLength > cap };
}

export function durationMs(startedAt: string | null, endedAt: string | null): number | null {
  if (startedAt === null || endedAt === null) return null;
  const span = Date.parse(endedAt) - Date.parse(startedAt);
  return Number.isFinite(span) && span >= 0 ? span : null;
}

/** The cursor holds the sort time and the id of the last row of a page. */
export function encodeRunCursor(sortKey: string, id: string): string {
  return `${sortKey}|${id}`;
}

export function decodeRunCursor(cursor: string | undefined) {
  if (cursor === undefined) return null;
  const cut = cursor.indexOf("|");
  return cut <= 0 ? null : { sortKey: cursor.slice(0, cut), id: cursor.slice(cut + 1) };
}

export interface RunTokens {
  readonly input: number | null;
  readonly cachedInput: number | null;
  readonly cacheCreation: number | null;
  readonly output: number | null;
}

/**
 * Dollars for the tokens a run's chat reported. Input already includes the cached and
 * cache-creation tokens, so those are priced at their own rates and taken out of plain input.
 * Null when no tokens were reported or the price table has no rate: never a false zero.
 */
export function runCostUsd(tokens: RunTokens, rate: TokenRates | null): number | null {
  if (rate === null || (tokens.input === null && tokens.output === null)) return null;
  const cached = tokens.cachedInput ?? 0;
  const created = tokens.cacheCreation ?? 0;
  const plain = Math.max(0, (tokens.input ?? 0) - cached - created);
  return (
    plain * rate.inputCostPerToken +
    cached * rate.cacheReadCostPerToken +
    created * rate.cacheCreationCostPerToken +
    (tokens.output ?? 0) * rate.outputCostPerToken
  );
}
