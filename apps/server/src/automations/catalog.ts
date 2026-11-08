// @effect-diagnostics nodeBuiltinImport:off - state is one small JSON file per machine.
// @effect-diagnostics globalDate:off - run times are wall-clock times.
import type {
  AutomationEntry,
  AutomationResult,
  FeedEventDraft,
  ScheduledTaskSchedule,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { nextScheduledRunAt } from "../scheduledTasks/Schedule.ts";
import { canonDrift } from "./canonDrift.ts";
import { type CheckInput, type CheckOutcome, decideNotify, findingsBody } from "./check.ts";
import { type DigestDeps, frontierDigest } from "./frontierDigest.ts";
import { releaseHealth } from "./releaseHealth.ts";
import { repoHealth } from "./repoHealth.ts";
import { upstreamDigest } from "./upstreamDigest.ts";

export interface BuiltIn {
  readonly id: string;
  readonly kind: "watcher" | "digest";
  readonly name: string;
  readonly line: string;
  /** Needs the Leonidas Code checkout, so only builders see it. */
  readonly builderOnly: boolean;
  readonly schedule: ScheduledTaskSchedule;
  readonly run: (
    input: CheckInput,
    deps: DigestDeps,
  ) => Promise<CheckOutcome & { readonly report?: ReadonlyArray<string> }>;
}

const HOUR = 3_600_000;

/** Every built-in automation. All are scripts with 0 model calls, except the digest (free engines only). */
export const BUILT_INS: ReadonlyArray<BuiltIn> = [
  {
    id: "repo-health",
    kind: "watcher",
    name: "Repo health",
    line: "Finds stale worktrees, work not pushed for a day, and stuck Git locks and task claims.",
    builderOnly: true,
    schedule: { type: "interval", everyMs: HOUR },
    run: (input) => repoHealth(input),
  },
  {
    id: "release-health",
    kind: "watcher",
    name: "Release health",
    line: "Checks that the last release run and its boot smoke passed.",
    builderOnly: true,
    schedule: { type: "interval", everyMs: 6 * HOUR },
    run: (input) => releaseHealth(input),
  },
  {
    id: "upstream-digest",
    kind: "watcher",
    name: "Upstream digest",
    line: "Lists new T3 Code commits that the upstream-review ledger has not seen.",
    builderOnly: true,
    schedule: { type: "fixed_time", timeOfDay: "09:00", weekdays: [1] },
    run: (input) => upstreamDigest(input),
  },
  {
    id: "canon-drift",
    kind: "watcher",
    name: "Skill and canon drift",
    line: "Finds broken links and stale paths in canon and skills, and counts unused skills.",
    builderOnly: false,
    schedule: { type: "fixed_time", timeOfDay: "08:00" },
    run: (input) => canonDrift(input),
  },
  {
    id: "frontier-digest",
    kind: "digest",
    name: "Frontier digest",
    line: "Reads the approved sources each week and files skill and canon ideas as task cards for you.",
    builderOnly: false,
    schedule: { type: "fixed_time", timeOfDay: "18:00", weekdays: [0] },
    run: (input, deps) => frontierDigest(input, deps),
  },
];

export interface AutomationState {
  readonly enabled?: boolean | undefined;
  readonly schedule?: ScheduledTaskSchedule | undefined;
  readonly lastRunAt?: string | undefined;
  readonly lastResult?: AutomationResult | undefined;
  readonly lastSummary?: string | undefined;
  readonly nextRunAt?: string | undefined;
  /** Finding keys of the last event, so the same problems are not sent again. */
  readonly notified?: ReadonlyArray<string> | undefined;
}

export type StateFile = Record<string, AutomationState>;

export function readState(file: string): StateFile {
  try {
    const value = JSON.parse(NodeFS.readFileSync(file, "utf8"));
    return typeof value === "object" && value !== null ? (value as StateFile) : {};
  } catch {
    return {};
  }
}

export function writeState(file: string, state: StateFile): void {
  NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  NodeFS.writeFileSync(temp, JSON.stringify(state, null, 2));
  NodeFS.renameSync(temp, file);
}

const DAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

function clock(timeOfDay: string): string {
  const [h = 0, m = 0] = timeOfDay.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** Plain words for a schedule, in 12-hour time. */
export function scheduleText(schedule: ScheduledTaskSchedule): string {
  switch (schedule.type) {
    case "interval": {
      const minutes = Math.round(schedule.everyMs / 60_000);
      if (minutes % 60 !== 0) return `Every ${minutes} minutes`;
      const hours = minutes / 60;
      return hours === 1 ? "Every hour" : `Every ${hours} hours`;
    }
    case "fixed_time": {
      const days = schedule.weekdays ?? [];
      const when =
        days.length === 0 || days.length === 7 ? "Daily" : days.map((day) => DAYS[day]).join(", ");
      return `${when} at ${clock(schedule.timeOfDay)}`;
    }
    case "once":
      return `Once at ${schedule.runAt}`;
    case "webhook":
      return "When a webhook arrives";
  }
}

export function nextRun(schedule: ScheduledTaskSchedule, from: number): string | null {
  const local = DateTime.makeZonedUnsafe(from, { timeZone: DateTime.zoneMakeLocal() });
  const next = nextScheduledRunAt(schedule, local);
  return next === null ? null : new Date(DateTime.toEpochMillis(next)).toISOString();
}

export function toEntry(builtIn: BuiltIn, state: AutomationState | undefined): AutomationEntry {
  const schedule = state?.schedule ?? builtIn.schedule;
  return {
    id: builtIn.id,
    kind: builtIn.kind,
    name: builtIn.name,
    line: builtIn.line,
    scheduleText: scheduleText(schedule),
    schedule,
    enabled: state?.enabled ?? true,
    lastRunAt: state?.lastRunAt ?? null,
    lastResult: state?.lastResult ?? "never",
    lastSummary: state?.lastSummary ?? null,
    nextRunAt: (state?.enabled ?? true) ? (state?.nextRunAt ?? null) : null,
    canRunNow: true,
  };
}

export interface RunOutput {
  readonly state: AutomationState;
  readonly report: ReadonlyArray<string>;
  readonly event: FeedEventDraft | null;
}

/** Runs one built-in and decides the event. A dry run returns the event but the caller must not write it. */
export async function runBuiltIn(
  builtIn: BuiltIn,
  previous: AutomationState | undefined,
  input: CheckInput,
  deps: DigestDeps,
): Promise<RunOutput> {
  let outcome: CheckOutcome & { readonly report?: ReadonlyArray<string> };
  try {
    outcome = await builtIn.run(input, deps);
  } catch (error) {
    outcome = { status: "skipped", summary: `The check stopped: ${String(error).slice(0, 200)}` };
  }
  const decision = decideNotify(previous?.notified ?? [], outcome);
  const schedule = previous?.schedule ?? builtIn.schedule;
  const lastResult: AutomationResult =
    outcome.status === "findings" ? "findings" : outcome.status === "ok" ? "ok" : "skipped";
  const summary = outcome.status === "findings" ? outcome.title : outcome.summary;
  const state: AutomationState = {
    ...previous,
    lastRunAt: new Date(input.now).toISOString(),
    lastResult,
    lastSummary: summary,
    nextRunAt: nextRun(schedule, input.now) ?? undefined,
    notified: decision.remember,
  };
  const findingLines =
    outcome.status === "findings" ? outcome.findings.map((finding) => finding.text) : [];
  const report = [summary, ...(outcome.report ?? []), ...findingLines];
  if (!decision.notify || outcome.status !== "findings") return { state, report, event: null };
  return {
    state,
    report,
    event: {
      level: outcome.level,
      type: `watcher.${builtIn.id}`,
      title: outcome.title.slice(0, 80),
      actor: { kind: "watcher", name: builtIn.name },
      body: findingsBody(outcome.summary, outcome.findings),
      dedupe: `watcher:${builtIn.id}:${NodeCrypto.createHash("sha1").update(decision.remember.join(",")).digest("hex")}`,
    },
  };
}
