import type { OrchestrationV2TurnItem } from "@t3tools/contracts";

type HandoffStrategy = Extract<OrchestrationV2TurnItem, { type: "handoff" }>["strategy"];

export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  return tokens >= 1_000 ? `${Math.round(tokens / 1_000)}k` : String(tokens);
}

/** "411k → 68k tokens". Null when the record has neither count. */
export function compactionReceiptDetail(
  before: number | undefined,
  after: number | undefined,
): string | null {
  if (before === undefined && after === undefined) return null;
  const side = (value: number | undefined) => (value === undefined ? "?" : formatTokenCount(value));
  return `${side(before)} → ${side(after)} tokens`;
}

const HANDOFF_STRATEGY_LABEL: Record<HandoffStrategy, string> = {
  delta_since_target_last_seen: "Only what changed since this account last saw the chat",
  full_thread_summary: "Summary of the whole chat",
  fork_delta_summary: "Summary of the changes in the copy",
  checkpoint_summary: "Summary from a checkpoint",
  manual_context: "Context added by hand",
};

export function handoffStrategyLabel(strategy: HandoffStrategy): string {
  return HANDOFF_STRATEGY_LABEL[strategy];
}
