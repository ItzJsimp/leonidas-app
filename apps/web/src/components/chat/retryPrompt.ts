import type { RunId } from "@t3tools/contracts";
import type { TimelineEntry } from "../../session-logic";

/** Recover the last user text seen within a run, without taking a later prompt. */
export function retryPromptForRun(
  entries: ReadonlyArray<TimelineEntry>,
  runId: RunId,
): string | null {
  let prompt: string | null = null;
  let promptRunId: RunId | null = null;
  let match: string | null = null;
  for (const entry of entries) {
    if (entry.kind === "message" && entry.message.role === "user") {
      prompt = entry.message.text.trim() ? entry.message.text : null;
      promptRunId = entry.message.runId;
    }
    const entryRunId =
      entry.kind === "message"
        ? entry.message.runId
        : entry.kind === "work"
          ? entry.entry.runId
          : entry.kind === "event"
            ? entry.projectedItem.item.runId
            : null;
    if (entryRunId === runId && (promptRunId === null || promptRunId === runId)) match = prompt;
  }
  return match;
}
