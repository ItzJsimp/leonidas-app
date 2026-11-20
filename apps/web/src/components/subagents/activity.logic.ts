import type { ScheduledTask, SubagentRun } from "@t3tools/contracts";

/** The agent's name, or the task's first words when the run has no agent name. */
export const runTitle = (run: Pick<SubagentRun, "agentName" | "summary">): string =>
  run.agentName ?? run.summary;

/** Local midnight of the day that holds `now`. */
export function startOfDay(now: number): number {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

/** Finished runs that ended today, newest first. */
export function doneToday<T extends Pick<SubagentRun, "endedAt">>(
  runs: ReadonlyArray<T>,
  now: number,
): T[] {
  const from = startOfDay(now);
  return runs
    .filter((run) => run.endedAt !== null && Date.parse(run.endedAt) >= from)
    .toSorted((a, b) => Date.parse(b.endedAt!) - Date.parse(a.endedAt!));
}

/** Schedules that are on and have a next run, soonest first. */
export function upcomingTasks<T extends Pick<ScheduledTask, "enabled" | "nextRunAt">>(
  tasks: ReadonlyArray<T>,
  limit: number,
): T[] {
  return tasks
    .filter((task) => task.enabled && task.nextRunAt !== null)
    .toSorted((a, b) => Date.parse(a.nextRunAt!) - Date.parse(b.nextRunAt!))
    .slice(0, limit);
}
