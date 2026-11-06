// @effect-diagnostics globalDate:off - turn timing is synchronous and runs outside Effect.
/**
 * Leonidas agent latency KPIs: time to first token and total turn duration per run.
 * Rules live in the AIOS standards/perf-thresholds.json (code.turn.*); without an AIOS the
 * emitter falls back to baseline-only rules and logs to ~/.leonidas/perf-events.jsonl.
 */
import { PerfMonitor } from "./perfMonitor.ts";

const perf = new PerfMonitor("leonidas-code");
const runs = new Map<string, { startedAt: number; firstOutputAt: number | null }>();

export function perfRunStarted(runId: string): void {
  runs.set(runId, { startedAt: Date.now(), firstOutputAt: null });
}

export function perfRunFirstOutput(runId: string): void {
  const run = runs.get(runId);
  if (run && run.firstOutputAt === null) run.firstOutputAt = Date.now();
}

/** Records only completed runs: interrupts and cancels measure the user, not the agent. */
export function perfRunFinished(
  runId: string,
  status: string,
  tags: { model?: string; provider?: string },
): void {
  const run = runs.get(runId);
  runs.delete(runId);
  if (!run || status !== "completed") return;
  const now = Date.now();
  if (run.firstOutputAt !== null)
    perf.record("code.turn.ttft_ms", run.firstOutputAt - run.startedAt, tags);
  perf.record("code.turn.total_ms", now - run.startedAt, tags);
}
