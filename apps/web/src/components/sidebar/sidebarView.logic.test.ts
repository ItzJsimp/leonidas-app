import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_SIDEBAR_VIEW,
  groupSidebarThreads,
  parseSidebarView,
  sidebarDateBucket,
  sidebarStatusLane,
} from "./sidebarView.logic";

// 2026-10-16 15:00 local time.
const NOW = new Date(2026, 9, 16, 15, 0, 0);
const at = (days: number, hour = 12) => new Date(2026, 9, 16 - days, hour, 0, 0).toISOString();

describe("parseSidebarView", () => {
  it("returns the default for missing or broken input", () => {
    expect(parseSidebarView(null)).toEqual(DEFAULT_SIDEBAR_VIEW);
    expect(parseSidebarView("{not json")).toEqual(DEFAULT_SIDEBAR_VIEW);
  });

  it("keeps valid fields and drops invalid ones", () => {
    const view = parseSidebarView(
      JSON.stringify({ groupBy: "status", density: "wrong", showTime: false, showRail: 3 }),
    );
    expect(view).toEqual({ ...DEFAULT_SIDEBAR_VIEW, groupBy: "status", showTime: false });
  });

  it("parses account grouping", () => {
    const view = parseSidebarView(JSON.stringify({ groupBy: "account" }));
    expect(view.groupBy).toBe("account");
  });

  it("defaults to the timeline with the project rail off", () => {
    expect(DEFAULT_SIDEBAR_VIEW.groupBy).toBe("date");
    expect(DEFAULT_SIDEBAR_VIEW.showRail).toBe(false);
  });
});

describe("sidebarDateBucket", () => {
  it("uses local calendar days, not 24 hour windows", () => {
    expect(sidebarDateBucket(at(0, 0), NOW)).toBe("today");
    expect(sidebarDateBucket(at(1, 23), NOW)).toBe("yesterday");
    expect(sidebarDateBucket(at(1, 0), NOW)).toBe("yesterday");
    expect(sidebarDateBucket(at(2), NOW)).toBe("week");
    expect(sidebarDateBucket(at(6), NOW)).toBe("week");
    expect(sidebarDateBucket(at(7), NOW)).toBe("month");
    expect(sidebarDateBucket(at(40), NOW)).toBe("older");
  });

  it("files future and unreadable times under today", () => {
    expect(sidebarDateBucket(new Date(2026, 9, 18).toISOString(), NOW)).toBe("today");
    expect(sidebarDateBucket("not a date", NOW)).toBe("older");
    expect(sidebarDateBucket(null, NOW)).toBe("older");
  });
});

describe("sidebarStatusLane", () => {
  it("puts stalled chats in Needs you", () => {
    for (const status of ["approval", "input", "failed", "limited"] as const) {
      expect(sidebarStatusLane({ status, isUnread: false, isWoke: false })).toBe("needs-you");
    }
    expect(sidebarStatusLane({ status: "ready", isUnread: false, isWoke: true })).toBe("needs-you");
  });

  it("separates running, unread and read chats", () => {
    expect(sidebarStatusLane({ status: "working", isUnread: true, isWoke: false })).toBe("running");
    expect(sidebarStatusLane({ status: "waiting", isUnread: false, isWoke: false })).toBe(
      "running",
    );
    expect(sidebarStatusLane({ status: "ready", isUnread: true, isWoke: false })).toBe("ready");
    expect(sidebarStatusLane({ status: "ready", isUnread: false, isWoke: false })).toBe("recent");
  });
});

describe("groupSidebarThreads", () => {
  const threads = [
    { id: "a", time: at(3), lane: "recent" as const },
    { id: "b", time: at(0, 9), lane: "needs-you" as const },
    { id: "c", time: at(0, 14), lane: "running" as const },
    { id: "d", time: at(1), lane: "needs-you" as const },
  ];
  const options = {
    now: NOW,
    timeOf: (thread: (typeof threads)[number]) => thread.time,
    laneOf: (thread: (typeof threads)[number]) => thread.lane,
  };

  it("groups by date newest first and drops empty groups", () => {
    const groups = groupSidebarThreads(threads, { ...options, groupBy: "date" });
    expect(groups.map((group) => [group.label, group.items.map((item) => item.id)])).toEqual([
      ["Today", ["c", "b"]],
      ["Yesterday", ["d"]],
      ["This week", ["a"]],
    ]);
  });

  it("groups by status lane in a fixed order, newest first inside each lane", () => {
    const groups = groupSidebarThreads(threads, { ...options, groupBy: "status" });
    expect(groups.map((group) => [group.id, group.items.map((item) => item.id)])).toEqual([
      ["needs-you", ["b", "d"]],
      ["running", ["c"]],
      ["recent", ["a"]],
    ]);
  });

  it("groups by project in project order, drops empty projects, and keeps unmatched chats", () => {
    const projectOf = { a: "web", b: "api", c: "web", d: null } as const;
    const groups = groupSidebarThreads(threads, {
      ...options,
      groupBy: "project",
      projects: [
        { key: "api", label: "API" },
        { key: "empty", label: "Empty" },
        { key: "web", label: "Web" },
      ],
      projectKeyOf: (thread) => projectOf[thread.id as keyof typeof projectOf],
    });
    expect(groups.map((group) => [group.label, group.items.map((item) => item.id)])).toEqual([
      ["API", ["b"]],
      ["Web", ["c", "a"]],
      ["Other", ["d"]],
    ]);
  });

  it("groups by account ordered by most recent activity and puts unmatched chats in Other", () => {
    const accountOf = { a: "personal", b: "work", c: "codex", d: null } as const;
    const accountLabels: Record<string, string> = {
      personal: "Claude Personal",
      work: "Anthropic Work",
      codex: "Codex",
    };
    const groups = groupSidebarThreads(threads, {
      ...options,
      groupBy: "account",
      accountKeyOf: (thread) => accountOf[thread.id as keyof typeof accountOf],
      accountLabelOf: (key) => accountLabels[key] ?? key,
    });
    expect(groups.map((group) => [group.label, group.items.map((item) => item.id)])).toEqual([
      ["Codex", ["c"]],
      ["Anthropic Work", ["b"]],
      ["Other", ["d"]],
      ["Claude Personal", ["a"]],
    ]);
  });

  it("returns one unlabeled group in classic mode and keeps the input order", () => {
    const groups = groupSidebarThreads(threads, { ...options, groupBy: "classic" });
    expect(groups).toEqual([{ id: "all", label: null, items: threads }]);
  });

  it("returns nothing for an empty list", () => {
    expect(groupSidebarThreads([], { ...options, groupBy: "date" })).toEqual([]);
  });
});
