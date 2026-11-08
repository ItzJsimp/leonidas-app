import type { AutomationEntry } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  filterRows,
  fromEntry,
  groupMarks,
  NOW_X,
  scheduleWords,
  statusOf,
  summarize,
  timeline,
  timelineTicks,
} from "./automations.logic";

const NOW = Date.parse("2026-11-08T04:23:00Z");
const HOUR = 3_600_000;

const entry = (
  patch: Partial<AutomationEntry> & Pick<AutomationEntry, "id" | "kind" | "name">,
): AutomationEntry => ({
  line: "",
  scheduleText: "",
  enabled: true,
  lastRunAt: null,
  lastResult: "ok",
  lastSummary: null,
  nextRunAt: null,
  canRunNow: false,
  ...patch,
});

const rows = [
  fromEntry(
    entry({
      id: "repo-health",
      kind: "watcher",
      name: "Repo health",
      lastResult: "findings",
      schedule: { type: "interval", everyMs: HOUR },
      nextRunAt: new Date(NOW + 58 * 60_000).toISOString(),
    }),
  ),
  fromEntry(
    entry({
      id: "task:AIOS-Daily-Briefing",
      kind: "windows_task",
      name: "AIOS-Daily-Briefing",
      file: "scripts/Briefing.ps1",
      nextRunAt: new Date(NOW + 9 * HOUR).toISOString(),
    }),
  ),
  fromEntry(
    entry({
      id: "task:AIOS-Old",
      kind: "windows_task",
      name: "AIOS-Old",
      enabled: false,
      nextRunAt: new Date(NOW + HOUR).toISOString(),
    }),
  ),
  fromEntry(
    entry({ id: "daemon:7", kind: "daemon", name: "voice.py (PID 7)", lastResult: "running" }),
  ),
  fromEntry(
    entry({ id: "engine-hook:x", kind: "engine_hook", name: "Claude Code PreToolUse: gate.py" }),
  ),
];

describe("automations logic", () => {
  it("says where each kind runs", () => {
    expect(rows.map((row) => row.runsIn)).toEqual([
      "Leonidas app (built in)",
      "Windows Task Scheduler",
      "Windows Task Scheduler",
      "Background process",
      "Claude Code hook",
    ]);
    expect(rows[1]!.what).toBe("scripts/Briefing.ps1");
  });

  it("filters by search, Needs you, Stopped and kind", () => {
    const all = { query: "", show: "all" as const, group: "all" as const };
    expect(filterRows(rows, all)).toHaveLength(5);
    expect(filterRows(rows, { ...all, show: "needs" }).map((row) => row.id)).toEqual([
      "repo-health",
    ]);
    expect(filterRows(rows, { ...all, show: "stopped" }).map((row) => row.id)).toEqual([
      "task:AIOS-Old",
    ]);
    expect(filterRows(rows, { ...all, group: "windows" })).toHaveLength(2);
    expect(filterRows(rows, { ...all, query: "briefing" }).map((row) => row.id)).toEqual([
      "task:AIOS-Daily-Briefing",
    ]);
  });

  it("summarizes, skipping stopped rows for Next up", () => {
    const summary = summarize(rows, NOW);
    expect(summary.needs.map((row) => row.id)).toEqual(["repo-health"]);
    expect(summary.stopped.map((row) => row.id)).toEqual(["task:AIOS-Old"]);
    expect(summary.alwaysOn).toBe(1);
    expect(summary.next?.id).toBe("repo-health");
  });

  it("places runs from 2 hours back to 22 hours ahead, none for stopped rows", () => {
    const lanes = timeline(rows, NOW);
    // Hourly from 58 minutes ahead to the window end, 22 hours ahead.
    expect(lanes.app).toHaveLength(22);
    expect(lanes.app.every((mark) => !mark.past)).toBe(true);
    expect(lanes.windows.map((mark) => mark.id)).toEqual(["task:AIOS-Daily-Briefing"]);
    expect(lanes.windows[0]!.x).toBeCloseTo(11 / 24);
    expect(NOW_X).toBeCloseTo(2 / 24);
  });

  it("draws a last run inside the window as a past mark left of now", () => {
    const ran = fromEntry(
      entry({ id: "w", kind: "watcher", name: "W", lastRunAt: new Date(NOW - HOUR).toISOString() }),
    );
    const [mark] = timeline([ran], NOW).app;
    expect(mark).toMatchObject({ past: true });
    expect(mark!.x).toBeCloseTo(1 / 24);
  });

  it("merges runs 15 minutes apart or less into one dot", () => {
    const mark = (id: string, minutes: number, past = false) => ({
      id,
      name: id,
      at: NOW + minutes * 60_000,
      x: 0,
      past,
    });
    const groups = groupMarks([
      mark("a", 60),
      mark("b", 60),
      mark("c", 70),
      mark("d", 120),
      mark("e", 125, true),
    ]);
    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([
      ["a", "b", "c"],
      ["d"],
      ["e"],
    ]);
  });

  it("puts ticks on clock hours that divide by 3", () => {
    const ticks = timelineTicks(NOW);
    expect(ticks.length).toBe(8);
    expect(
      ticks.every(
        (tick) => new Date(tick.at).getMinutes() === 0 && new Date(tick.at).getHours() % 3 === 0,
      ),
    ).toBe(true);
  });

  it("puts Stopped above the last result and words schedules in 12-hour time", () => {
    expect(statusOf(rows[2]!).label).toBe("Stopped");
    expect(statusOf(rows[0]!).label).toBe("Needs a look");
    expect(scheduleWords({ type: "fixed_time", timeOfDay: "20:00", weekdays: [1] })).toBe(
      "Mondays at 8:00 PM",
    );
    expect(scheduleWords({ type: "interval", everyMs: 2 * 24 * HOUR })).toBe("Every 2 days");
  });
});
