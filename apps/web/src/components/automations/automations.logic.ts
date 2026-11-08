import type { AutomationEntry, ScheduledTask, ScheduledTaskSchedule } from "@t3tools/contracts";

/** One row in the Automations tab: an app automation, an agent schedule or a register entry. */
export interface AutomationRow extends AutomationEntry {
  /** Where it runs, in plain words. */
  readonly runsIn: string;
  /** What it runs: a check, a script path or a chat. */
  readonly what: string;
  readonly group: GroupId;
  /** Agent schedules only: the prompt and model, edited in the schedule editor. */
  readonly prompt?: string;
  readonly model?: string;
  readonly scheduledTaskId?: string;
  readonly environmentId?: string;
}

export type GroupId = "app" | "agents" | "windows" | "always" | "hooks";

export const GROUPS: ReadonlyArray<{ readonly id: GroupId; readonly label: string }> = [
  { id: "app", label: "App watchers" },
  { id: "agents", label: "Agent schedules" },
  { id: "windows", label: "Windows tasks" },
  { id: "always", label: "Always on" },
  { id: "hooks", label: "Hooks" },
];

export type ShowFilter = "all" | "needs" | "stopped";

const DAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

function clock(timeOfDay: string): string {
  const [h = 0, m = 0] = timeOfDay.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Plain words for a schedule, in 12-hour time. */
export function scheduleWords(schedule: ScheduledTaskSchedule): string {
  switch (schedule.type) {
    case "interval": {
      const minutes = Math.round(schedule.everyMs / 60_000);
      if (minutes % 60 !== 0) return `Every ${minutes} minutes`;
      const hours = minutes / 60;
      if (hours % 24 === 0) return hours === 24 ? "Every day" : `Every ${hours / 24} days`;
      return hours === 1 ? "Every hour" : `Every ${hours} hours`;
    }
    case "fixed_time": {
      const days = schedule.weekdays ?? [];
      const when =
        days.length === 0 || days.length === 7 ? "Daily" : days.map((day) => DAYS[day]).join(", ");
      return `${when} at ${clock(schedule.timeOfDay)}`;
    }
    case "once":
      return "Once";
    case "webhook":
      return "When a webhook arrives";
  }
}

function groupOf(kind: AutomationEntry["kind"]): GroupId {
  switch (kind) {
    case "watcher":
    case "digest":
      return "app";
    case "agent_schedule":
      return "agents";
    case "windows_task":
      return "windows";
    case "daemon":
      return "always";
    default:
      return "hooks";
  }
}

function runsIn(entry: AutomationEntry): string {
  switch (entry.kind) {
    case "watcher":
    case "digest":
      return "Leonidas app (built in)";
    case "agent_schedule":
      return "Leonidas app (agent chat)";
    case "windows_task":
      return "Windows Task Scheduler";
    case "daemon":
      return "Background process";
    case "git_hook":
      return "Git hook";
    case "engine_hook":
      return entry.name.startsWith("Claude Code") ? "Claude Code hook" : "Antigravity hook";
  }
}

function what(entry: AutomationEntry): string {
  if (entry.kind === "watcher") return "A built-in check. No model.";
  if (entry.kind === "digest") return "A built-in digest. Free models only.";
  return entry.file ?? entry.line;
}

export function fromEntry(entry: AutomationEntry): AutomationRow {
  return { ...entry, runsIn: runsIn(entry), what: what(entry), group: groupOf(entry.kind) };
}

const RUN_RESULT = {
  never: "never",
  running: "running",
  succeeded: "ok",
  failed: "failed",
} as const;

export function fromScheduledTask(task: ScheduledTask, environmentId: string): AutomationRow {
  const firstLine = task.prompt.split(/(?<=[.!?])\s/)[0] ?? task.prompt;
  return {
    id: `agent:${task.id}`,
    kind: "agent_schedule",
    name: task.title,
    line: firstLine.length > 140 ? `${firstLine.slice(0, 137)}...` : firstLine,
    scheduleText: scheduleWords(task.schedule),
    schedule: task.schedule,
    enabled: task.enabled,
    lastRunAt: task.lastRunAt,
    lastResult: RUN_RESULT[task.lastRunStatus],
    lastSummary: task.lastRunError,
    nextRunAt: task.enabled ? task.nextRunAt : null,
    canRunNow: true,
    runsIn: "Leonidas app (agent chat)",
    what: "A chat with your model, using the prompt below.",
    group: "agents",
    prompt: task.prompt,
    model: task.modelSelection.model,
    scheduledTaskId: task.id,
    environmentId,
  };
}

export const needsYou = (row: AutomationRow) =>
  row.lastResult === "findings" || row.lastResult === "failed";
export const isStopped = (row: AutomationRow) => row.enabled === false;

/** The status chip: stopped wins over the last result. */
export function statusOf(row: AutomationRow): {
  readonly label: string;
  readonly tone: "warn" | "error" | "ok" | "off" | "state" | "none";
} {
  if (isStopped(row)) return { label: "Stopped", tone: "off" };
  switch (row.lastResult) {
    case "findings":
      return { label: "Needs a look", tone: "warn" };
    case "failed":
      return { label: "Failed", tone: "error" };
    case "running":
      return { label: row.kind === "daemon" ? "Running" : "Running now", tone: "state" };
    case "ok":
      return { label: "Passed", tone: "ok" };
    case "skipped":
      return { label: "Skipped", tone: "none" };
    default:
      return { label: "Not run yet", tone: "none" };
  }
}

export function filterRows(
  rows: ReadonlyArray<AutomationRow>,
  filter: { readonly query: string; readonly show: ShowFilter; readonly group: GroupId | "all" },
): AutomationRow[] {
  const query = filter.query.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (filter.group === "all" || row.group === filter.group) &&
      (filter.show === "all" || (filter.show === "needs" ? needsYou(row) : isStopped(row))) &&
      (query === "" ||
        `${row.name} ${row.line} ${row.what} ${row.scheduleText}`.toLowerCase().includes(query)),
  );
}

export interface Summary {
  readonly needs: ReadonlyArray<AutomationRow>;
  readonly stopped: ReadonlyArray<AutomationRow>;
  readonly alwaysOn: number;
  readonly next: AutomationRow | null;
}

export function summarize(rows: ReadonlyArray<AutomationRow>, now: number): Summary {
  let next: AutomationRow | null = null;
  for (const row of rows) {
    if (!row.nextRunAt || isStopped(row) || Date.parse(row.nextRunAt) < now) continue;
    if (next === null || Date.parse(row.nextRunAt) < Date.parse(next.nextRunAt!)) next = row;
  }
  return {
    needs: rows.filter(needsYou),
    stopped: rows.filter(isStopped),
    alwaysOn: rows.filter((row) => row.kind === "daemon").length,
    next,
  };
}

export interface Mark {
  readonly id: string;
  readonly name: string;
  readonly at: number;
  /** 0 to 1 across the window. */
  readonly x: number;
  /** A run that already happened (its last run), drawn hollow left of the now line. */
  readonly past: boolean;
}

/** The window: 2 hours back, so the now line and the latest runs show, then 22 hours ahead. */
export const TIMELINE_PAST_MS = 2 * 3_600_000;
export const TIMELINE_MS = 24 * 3_600_000;
/** Where the now line sits, 0 to 1. */
export const NOW_X = TIMELINE_PAST_MS / TIMELINE_MS;
const MAX_MARKS_PER_ROW = 48;

export type Lane = "app" | "agents" | "windows";

/** Every run in the window: last runs inside it, the next run, then repeats for interval schedules. */
export function timeline(rows: ReadonlyArray<AutomationRow>, now: number): Record<Lane, Mark[]> {
  const lanes: Record<Lane, Mark[]> = { app: [], agents: [], windows: [] };
  const start = now - TIMELINE_PAST_MS;
  const end = start + TIMELINE_MS;
  const x = (at: number) => (at - start) / TIMELINE_MS;
  for (const row of rows) {
    if (row.group !== "app" && row.group !== "agents" && row.group !== "windows") continue;
    const last = row.lastRunAt ? Date.parse(row.lastRunAt) : Number.NaN;
    if (last >= start && last < now) {
      lanes[row.group].push({ id: row.id, name: row.name, at: last, x: x(last), past: true });
    }
    if (!row.nextRunAt || isStopped(row)) continue;
    const every = row.schedule?.type === "interval" ? Math.max(row.schedule.everyMs, 60_000) : null;
    let at = Date.parse(row.nextRunAt);
    for (let count = 0; at <= end && count < MAX_MARKS_PER_ROW; count++) {
      if (at >= now)
        lanes[row.group].push({ id: row.id, name: row.name, at, x: x(at), past: false });
      if (every === null) break;
      at += every;
    }
  }
  for (const lane of Object.values(lanes)) lane.sort((a, b) => a.at - b.at);
  return lanes;
}

export interface MarkGroup {
  readonly at: number;
  readonly x: number;
  readonly past: boolean;
  readonly items: ReadonlyArray<Mark>;
}

/** Runs closer than this share one dot: at the usual width a dot covers about 20 minutes. */
const GROUP_MS = 15 * 60_000;

/** Merges runs in one lane that would draw on top of each other. Marks must be sorted by time. */
export function groupMarks(marks: ReadonlyArray<Mark>): MarkGroup[] {
  const groups: Array<{ at: number; x: number; past: boolean; items: Mark[] }> = [];
  for (const mark of marks) {
    const last = groups.at(-1);
    if (last && last.past === mark.past && mark.at - last.at <= GROUP_MS) last.items.push(mark);
    else groups.push({ at: mark.at, x: mark.x, past: mark.past, items: [mark] });
  }
  return groups;
}

/** Clock-hour ticks every 3 hours inside the window, as positions 0 to 1. */
export function timelineTicks(
  now: number,
): ReadonlyArray<{ readonly at: number; readonly x: number }> {
  const start = now - TIMELINE_PAST_MS;
  const first = new Date(start);
  first.setMinutes(0, 0, 0);
  first.setHours(first.getHours() + 1);
  while (first.getHours() % 3 !== 0) first.setHours(first.getHours() + 1);
  const ticks: Array<{ at: number; x: number }> = [];
  for (let at = first.getTime(); at < start + TIMELINE_MS; at += 3 * 3_600_000) {
    ticks.push({ at, x: (at - start) / TIMELINE_MS });
  }
  return ticks;
}

/** "10:21 PM", or "Mon 9:00 AM" when the day is not today. */
export function timeLabel(at: number, now: number): string {
  const date = new Date(at);
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return new Date(now).toDateString() === date.toDateString()
    ? time
    : `${date.toLocaleDateString("en-US", { weekday: "short" })} ${time}`;
}
