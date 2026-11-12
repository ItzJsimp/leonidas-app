import type { SubagentRun, SubagentRunKind, SubagentRunStatus } from "@t3tools/contracts";

import type { WindowTab } from "../../twoState/WindowHeader";

/** The Agents window tabs. Team comes first, so it is the one that opens by default. */
export const AGENT_TABS: readonly WindowTab[] = [
  { id: "team", label: "Team" },
  { id: "runs", label: "Runs" },
  { id: "starters", label: "Starters" },
];

/** "$0.03", "under $0.01" for a tiny cost, or "Cost unknown". */
export function costLabel(costUsd: number | null): string {
  if (costUsd === null) return "Cost unknown";
  if (costUsd > 0 && costUsd < 0.005) return "under $0.01";
  return `$${costUsd.toFixed(2)}`;
}

/** The four tiles above the run list. */
export interface RunsStats {
  readonly running: number;
  readonly waiting: number;
  readonly runsToday: number;
  readonly doneToday: number;
  readonly failedToday: number;
  readonly spendTodayUsd: number;
  readonly capUsd: number | null;
}

/**
 * Counts the runs on screen: live ones now, and what started since local midnight.
 * shortcut: it counts the loaded page only, so a day with more runs than one page undercounts.
 * Upgrade when the server returns today's totals (the spawn gate already has the spend).
 */
export function runsStats(
  runs: ReadonlyArray<Pick<SubagentRun, "status" | "startedAt" | "costUsd">>,
  now: number,
  capUsd: number | null,
): RunsStats {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const today = runs.filter(
    (run) => run.startedAt !== null && Date.parse(run.startedAt) >= midnight.getTime(),
  );
  return {
    running: runs.filter((run) => run.status === "running").length,
    waiting: runs.filter((run) => run.status === "waiting").length,
    runsToday: today.length,
    doneToday: today.filter((run) => run.status === "done").length,
    failedToday: today.filter((run) => run.status === "failed").length,
    spendTodayUsd: today.reduce((sum, run) => sum + (run.costUsd ?? 0), 0),
    capUsd,
  };
}

/** How much of the daily cap is spent, 0 to 100. Zero when there is no cap. */
export const spendPercent = (stats: Pick<RunsStats, "spendTodayUsd" | "capUsd">): number =>
  stats.capUsd === null || stats.capUsd <= 0
    ? 0
    : Math.min(100, Math.round((stats.spendTodayUsd / stats.capUsd) * 100));

export const STATUS_LABEL: Readonly<Record<SubagentRunStatus, string>> = {
  running: "Running",
  waiting: "Waiting for you",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
};

/** Badge colors. The word always shows too, so color never carries the status alone. */
export const STATUS_VARIANT: Readonly<
  Record<SubagentRunStatus, "info" | "warning" | "success" | "error" | "outline">
> = {
  running: "info",
  waiting: "warning",
  done: "success",
  failed: "error",
  cancelled: "outline",
};

export const KIND_LABEL: Readonly<Record<SubagentRunKind, string>> = {
  delegated: "Delegated task",
  persona: "Team agent",
  native: "Built-in helper",
  workflow: "Workflow",
};

export const KIND_HELP: Readonly<Record<SubagentRunKind, string>> = {
  delegated: "A chat handed this task to a new chat of its own.",
  persona: "An agent from your team that a chat started, such as a reviewer.",
  native: "A helper that the AI provider started inside the chat turn.",
  workflow: "A coordinator that runs several helpers in steps.",
};

export const STATUS_FILTERS: ReadonlyArray<{
  readonly id: "all" | Exclude<SubagentRunStatus, "running" | "waiting">;
  readonly label: string;
}> = [
  { id: "all", label: "All results" },
  { id: "done", label: "Done" },
  { id: "failed", label: "Failed" },
  { id: "cancelled", label: "Cancelled" },
];

/** "45 s", "2 min 5 s", "1 h 3 min". */
export function formatSpan(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const rest = seconds % 60;
    return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
  }
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes === 0 ? `${hours} h` : `${hours} h ${restMinutes} min`;
}

/** How long a run has gone: a live count while it runs, the stored span after it ended. */
export function elapsedLabel(run: SubagentRun, now: number): string {
  if (run.durationMs !== null) return formatSpan(run.durationMs);
  if (run.startedAt === null) return run.status === "running" ? "Starting" : "";
  const start = Date.parse(run.startedAt);
  return Number.isFinite(start) ? formatSpan(now - start) : "";
}

export function isLive(run: Pick<SubagentRun, "status">): boolean {
  return run.status === "running" || run.status === "waiting";
}

/** The model and provider as one short line, for example "claude-haiku-5-5 on claude". */
export function modelLine(run: Pick<SubagentRun, "model" | "provider">): string {
  return run.model ? `${run.model} on ${run.provider}` : run.provider;
}

/** The chats that runs came from, one entry each, sorted by title. */
export function parentChats(
  runs: ReadonlyArray<Pick<SubagentRun, "parent">>,
): Array<SubagentRun["parent"]> {
  const byId = new Map<string, SubagentRun["parent"]>();
  for (const run of runs) byId.set(run.parent.id, run.parent);
  return [...byId.values()].toSorted((a, b) => a.title.localeCompare(b.title));
}

/** Keeps the runs a typed word matches, for the Running tab where all runs are in memory. */
export function matchRuns(runs: ReadonlyArray<SubagentRun>, query: string): SubagentRun[] {
  const word = query.trim().toLowerCase();
  if (word === "") return [...runs];
  return runs.filter((run) =>
    `${run.summary} ${run.parent.title} ${modelLine(run)} ${KIND_LABEL[run.kind]}`
      .toLowerCase()
      .includes(word),
  );
}

/** What the Runs tab shows when the list is empty. */
export const EMPTY_RUNS = {
  title: "No agent runs yet",
  line: "When a chat starts an agent from your team, the run shows here with its model, its cost and its result.",
};

/** The text under the result when no answer exists, by the status of the run. */
export function resultPlaceholder(run: Pick<SubagentRun, "status" | "rawStatus">): string {
  switch (run.status) {
    case "running":
    case "waiting":
      return "Still working. The answer shows here when it is done.";
    case "failed":
      return "The run failed before it gave an answer.";
    case "cancelled":
      return run.rawStatus === "interrupted"
        ? "A stop or a restart ended this run before it gave an answer."
        : "This run was cancelled before it gave an answer.";
    case "done":
      return "This subagent gave no final answer.";
  }
}
