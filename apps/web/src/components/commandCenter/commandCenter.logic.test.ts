import { describe, expect, it } from "vite-plus/test";

import {
  areaBars,
  capRows,
  doneSeries,
  goalMeta,
  needsYouLine,
  oldestAt,
  ringPercent,
  statusSegments,
  updatedLabel,
  usageGlance,
} from "./commandCenter.logic";

const now = new Date(2026, 9, 22, 20, 5).getTime();
const at = (day: number, hour = 12, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const counts = { todo: 14, inProgress: 6, review: 8, blocked: 3 };
const areas = [
  { id: "tasks", units: 118, changedAt: 1 },
  { id: "logs", units: 230, changedAt: 1 },
];

describe("statusSegments", () => {
  it("sizes each status by its share and keeps the order", () => {
    const { total, segments } = statusSegments(counts);
    expect(total).toBe(31);
    expect(segments.map((segment) => [segment.label, segment.value])).toEqual([
      ["In progress", 6],
      ["To do", 14],
      ["In review", 8],
      ["Blocked", 3],
    ]);
    expect(segments[0]!.percent).toBeCloseTo(19.35, 1);
  });

  it("returns no segments for zero tasks", () => {
    expect(statusSegments({ todo: 0, inProgress: 0, review: 0, blocked: 0 })).toEqual({
      total: 0,
      segments: [],
      legend: [
        { key: "inProgress", label: "In progress", value: 0, tone: "foreground" },
        { key: "todo", label: "To do", value: 0, tone: "muted" },
        { key: "review", label: "In review", value: 0, tone: "info" },
        { key: "blocked", label: "Blocked", value: 0, tone: "warning" },
      ],
    });
  });

  it("drops a status with no tasks from the bar but keeps it in the legend", () => {
    const { segments, legend } = statusSegments({ ...counts, blocked: 0 });
    expect(segments.map((segment) => segment.label)).not.toContain("Blocked");
    expect(legend.map((row) => row.label)).toContain("Blocked");
  });
});

describe("ringPercent", () => {
  it("is a whole percent", () => {
    expect(ringPercent(2, 5)).toBe(40);
    expect(ringPercent(5, 5)).toBe(100);
  });
  it("is null for no tasks, never NaN", () => {
    expect(ringPercent(0, 0)).toBeNull();
  });
  it("never goes past 100", () => {
    expect(ringPercent(7, 5)).toBe(100);
  });
});

describe("areaBars", () => {
  it("sorts by size and scales to the biggest", () => {
    const { total, bars } = areaBars([...areas, { id: "wiki", units: 35, changedAt: 1 }]);
    expect(total).toBe(383);
    expect(bars.map((bar) => [bar.label, bar.units])).toEqual([
      ["Logs", 230],
      ["Task cards", 118],
      ["Wiki", 35],
    ]);
    expect(bars[0]!.widthPercent).toBe(100);
    expect(bars[2]!.widthPercent).toBeCloseTo(15.2, 1);
  });
  it("handles no areas and areas with no units", () => {
    expect(areaBars([])).toEqual({ total: 0, bars: [] });
    expect(areaBars([{ id: "tasks", units: 0, changedAt: 0 }]).bars[0]!.widthPercent).toBe(0);
  });
});

describe("doneSeries", () => {
  const task = (completedAt: number | null, extra: object = {}) => ({
    status: "done" as const,
    completedAt,
    ...extra,
  });

  it("counts finished tasks per local day for 14 days, today last", () => {
    const series = doneSeries(
      [task(at(22, 8)), task(at(22, 19)), task(at(21)), task(at(9, 1)), task(at(8, 23))],
      now,
    );
    expect(series.days).toHaveLength(14);
    expect(series.days.at(-1)).toMatchObject({ label: "22", count: 2, today: true });
    expect(series.days[0]).toMatchObject({ label: "9", count: 1, today: false });
    expect(series.total).toBe(4);
    expect(series.today).toBe(2);
    expect(series.average).toBe(0.3);
  });

  it("ignores open tasks, tasks with no date and agent run records", () => {
    const series = doneSeries(
      [
        { status: "todo" as const, completedAt: at(22) },
        task(null),
        task(at(22), { kind: "agent_run" }),
      ],
      now,
    );
    expect(series.total).toBe(0);
  });

  it("compares the last 7 days with the 7 before in words", () => {
    const series = doneSeries(
      [task(at(22)), task(at(21)), task(at(20)), task(at(12)), task(at(11))],
      now,
    );
    expect(series.week).toBe(3);
    expect(series.weekBefore).toBe(2);
    expect(series.change).toBe("1 more than the 7 days before");
    expect(doneSeries([task(at(22)), task(at(14))], now).change).toBe("Same as the 7 days before");
    expect(doneSeries([task(at(14)), task(at(13))], now).change).toBe(
      "2 fewer than the 7 days before",
    );
  });
});

describe("updatedLabel", () => {
  it("says just now, minutes, then the clock", () => {
    expect(updatedLabel(now - 10_000, now)).toBe("Updated just now");
    expect(updatedLabel(now - 60_000, now)).toBe("Updated 1 min ago");
    expect(updatedLabel(at(22, 8, 0), now)).toBe("Updated 8:00 AM");
  });
  it("says so when nothing was read yet", () => {
    expect(updatedLabel(0, now)).toBe("Not read yet");
  });
});

describe("feed helpers", () => {
  const event = (ts: string) => ({ ts }) as never;
  it("finds the oldest event time", () => {
    expect(oldestAt([])).toBeNull();
    const a = new Date(2026, 9, 22, 9).toISOString();
    const b = new Date(2026, 9, 21, 9).toISOString();
    expect(oldestAt([event(a), event(b)])).toBe(Date.parse(b));
  });
});

describe("capRows", () => {
  it("shows every row up to the cap", () => {
    expect(capRows([1, 2, 3], 5)).toEqual({ shown: [1, 2, 3], hidden: 0 });
  });

  it("cuts to the cap and counts the rest", () => {
    expect(capRows([1, 2, 3, 4, 5, 6, 7], 5)).toEqual({ shown: [1, 2, 3, 4, 5], hidden: 2 });
  });
});

describe("goalMeta", () => {
  it("shows due only for a real date", () => {
    expect(goalMeta({ status: "On track", targetDate: "2026-12-31" })).toBe(
      "On track · due 2026-12-31",
    );
    expect(goalMeta({ status: "", targetDate: "Dec 31, 2026" })).toBe("due Dec 31, 2026");
    expect(goalMeta({ status: "Active", targetDate: "Ongoing" })).toBe("Active · Ongoing");
    expect(goalMeta({ status: "Active", targetDate: "2026-13-45" })).toBe("Active · 2026-13-45");
    expect(goalMeta({ status: "", targetDate: "" })).toBe("");
  });
});

describe("needsYouLine", () => {
  it("leads with the chat name for app events", () => {
    expect(
      needsYouLine({
        title: "Input needed",
        body: "Thin Leonidas layer for upstream",
        actor: { kind: "app", name: "Leonidas" },
      }),
    ).toEqual({ primary: "Thin Leonidas layer for upstream", secondary: "Input needed" });
  });
  it("keeps the title and names the source for other events", () => {
    expect(
      needsYouLine({
        title: "AIOS Sync Failing",
        body: "Outcome: FAILED",
        actor: { kind: "script", name: "Send-Notification.ps1" },
      }),
    ).toEqual({ primary: "AIOS Sync Failing", secondary: "Send-Notification.ps1" });
  });
});

describe("usageGlance", () => {
  const account = (id: string, ...used: number[]) => ({
    id,
    label: id,
    limits: { windows: used.map((usedPercent) => ({ usedPercent })) },
  });
  it("puts the active account on the gauge and the two fullest others under it", () => {
    const glance = usageGlance(
      [account("claude", 10, 38)],
      [account("codex", 0, 68), account("grok"), account("router", 100), account("pi", 5)],
    );
    expect(glance.main?.account.id).toBe("claude");
    expect(glance.main?.window.usedPercent).toBe(38);
    expect(glance.rest.map((row) => row.account.id)).toEqual(["router", "codex"]);
  });
  it("uses the fullest account when no active one reports windows", () => {
    const glance = usageGlance([], [account("codex", 68), account("pi", 5)]);
    expect(glance.main?.account.id).toBe("codex");
    expect(glance.rest.map((row) => row.account.id)).toEqual(["pi"]);
    expect(usageGlance([], []).main).toBeNull();
  });
});
