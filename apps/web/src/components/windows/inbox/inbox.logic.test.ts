import { completeFeedEvent, type FeedEventDraft, type FoldedFeedEvent } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { mergeDuplicateEvents, type MergedFeedEvent } from "../../twoState/railFeed";
import {
  eventKind,
  filterInboxEvents,
  formatInboxTitle,
  groupInbox,
  inboxEmptyText,
  linkedThreadId,
  neighborRowId,
  nextRowIndex,
  olderThanIds,
  projectOptions,
  sourceLabel,
  unreadIds,
  type InboxSourceMeta,
} from "./inbox.logic";

const NOW = new Date(2026, 9, 21, 15, 0, 0).getTime();
const at = (days: number, hour: number) => new Date(2026, 9, 21 - days, hour, 0, 0).getTime();

const rawEvent = (
  title: string,
  when: number,
  extra: Partial<FeedEventDraft> = {},
): FoldedFeedEvent => ({
  ...completeFeedEvent(
    {
      level: "info",
      type: "agent.finished",
      title,
      actor: { kind: "agent", name: "Leonidas" },
      ...extra,
    },
    when,
  ),
  count: 1,
});

const mergeOne = (event: FoldedFeedEvent): MergedFeedEvent => mergeDuplicateEvents([event], {})[0]!;

const asks = mergeOne(
  rawEvent("Pick a chart", at(0, 9), { level: "needs_you", type: "agent.needs_input" }),
);
const failed = mergeOne(
  rawEvent("Backup failed", at(0, 3), { level: "failed", type: "script.failed" }),
);
const doneToday = mergeOne(rawEvent("Vision map updated", at(0, 12)));
const doneOld = mergeOne(rawEvent("Weekly report ready", at(2, 16), { body: "Usage went down" }));
const answered = mergeOne(
  rawEvent("Old question", at(0, 1), { level: "needs_you", type: "agent.needs_input" }),
);
const all = [doneOld, answered, doneToday, failed, asks];
const marks = { [answered.id]: { read: true as const } };
const defaultSource = (event: MergedFeedEvent): InboxSourceMeta => ({
  project: event.actor.name,
  threadTitle: null,
});

describe("groupInbox", () => {
  it("groups by urgency: Needs you first, then Updates (today), then Earlier", () => {
    const groups = groupInbox(all, marks, NOW);
    expect(groups.map((group) => group.key)).toEqual(["needs-you", "updates", "earlier"]);
    expect(groups[0]!.events.map((item) => item.title)).toEqual(["Pick a chart", "Backup failed"]);
    expect(groups[1]!.events.map((item) => item.title)).toEqual([
      "Vision map updated",
      "Old question",
    ]);
    expect(groups[2]!.events.map((item) => item.title)).toEqual(["Weekly report ready"]);
  });

  it("drops empty groups", () => {
    expect(groupInbox([doneOld], {}, NOW).map((group) => group.key)).toEqual(["earlier"]);
    expect(groupInbox([], {}, NOW)).toEqual([]);
  });
});

describe("duplicate merging in inbox grouping", () => {
  it("renders 3 identical events as 1 row with repeat count 3", () => {
    const e1 = rawEvent("Mailpoller failed", at(0, 8), { level: "failed", type: "script.failed" });
    const e2 = rawEvent("Mailpoller failed", at(0, 9), { level: "failed", type: "script.failed" });
    const e3 = rawEvent("Mailpoller failed", at(0, 10), { level: "failed", type: "script.failed" });
    const merged = mergeDuplicateEvents([e1, e2, e3], {});
    const groups = groupInbox(merged, {}, NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.key).toBe("needs-you");
    expect(groups[0]!.events).toHaveLength(1);
    expect(groups[0]!.events[0]!.count).toBe(3);
  });
});

describe("eventKind and formatInboxTitle", () => {
  it("maps event types to semantic icon kinds", () => {
    expect(eventKind({ level: "failed", type: "script.failed" })).toBe("failed");
    expect(eventKind({ level: "needs_you", type: "agent.needs_permission" })).toBe("approval");
    expect(eventKind({ level: "needs_you", type: "agent.needs_input" })).toBe("input");
    expect(eventKind({ level: "needs_you", type: "agent.usage_limit" })).toBe("limit");
    expect(eventKind({ level: "info", type: "agent.finished" })).toBe("finished");
    expect(eventKind({ level: "info", type: "aios.changed" })).toBe("update");
  });

  it("clamps titles to 60 characters or fewer on one line", () => {
    const longTitle =
      "This notification title is intentionally longer than sixty characters to verify truncation";
    const formatted = formatInboxTitle(longTitle);
    expect(formatted.length).toBeLessThanOrEqual(60);
    expect(formatted.endsWith("…")).toBe(true);
    expect(formatInboxTitle("Short title")).toBe("Short title");
  });
});

describe("filterInboxEvents and projectOptions", () => {
  it("filters by type, project, unread, and search query", () => {
    const scriptEvent = mergeOne(
      rawEvent("Mailpoller failed", at(0, 11), {
        level: "failed",
        type: "script.failed",
        actor: { kind: "script", name: "Send-Notification.ps1" },
      }),
    );
    const items = [...all, scriptEvent];
    expect(projectOptions(items, defaultSource)).toEqual(["Leonidas", "Send-Notification.ps1"]);

    expect(
      filterInboxEvents(
        items,
        marks,
        { type: "failed", project: "Send-Notification.ps1", unreadOnly: true, query: "mailpoller" },
        defaultSource,
      ).map((item) => item.id),
    ).toEqual([scriptEvent.id]);

    expect(
      filterInboxEvents(
        all,
        marks,
        { type: "all", project: "all", unreadOnly: true, query: "" },
        defaultSource,
      ).map((item) => item.id),
    ).not.toContain(answered.id);
  });
});

describe("olderThanIds and unreadIds", () => {
  it("collects all merged ids older than the selected cutoff", () => {
    const older = olderThanIds(all, 24 * 60 * 60 * 1000, NOW);
    expect(older.rows).toBe(1);
    expect(older.ids).toEqual([doneOld.id]);
  });

  it("collects all underlying unread ids", () => {
    expect(unreadIds(all, marks).toSorted()).toEqual(
      [asks.id, failed.id, doneToday.id, doneOld.id].toSorted(),
    );
  });
});

describe("navigation and metadata helpers", () => {
  it("moves with arrow, home, and end keys", () => {
    expect(nextRowIndex("ArrowDown", 0, 3)).toBe(1);
    expect(nextRowIndex("ArrowDown", 2, 3)).toBe(2);
    expect(nextRowIndex("ArrowUp", 0, 3)).toBe(0);
    expect(nextRowIndex("Home", 2, 3)).toBe(0);
    expect(nextRowIndex("End", 0, 3)).toBe(2);
    expect(nextRowIndex("a", 0, 3)).toBeNull();
    expect(nextRowIndex("ArrowDown", 0, 0)).toBeNull();
  });

  it("picks neighbor row id and resolves source and linked thread", () => {
    const rows = [asks, failed, doneToday];
    expect(neighborRowId(rows, asks.id)).toBe(failed.id);
    expect(neighborRowId(rows, doneToday.id)).toBe(failed.id);
    expect(sourceLabel(asks)).toBe("Leonidas");
    expect(linkedThreadId(rawEvent("Ask", at(0, 9), { target: { thread: "thr_1" } }))).toBe(
      "thr_1",
    );
    expect(linkedThreadId(rawEvent("Done", at(0, 9)))).toBeNull();
  });
});

describe("inboxEmptyText", () => {
  it("uses one plain line with no filler when empty", () => {
    expect(inboxEmptyText([])).toEqual({ title: "No notifications.", line: "" });
  });

  it("reports skipped unreadable lines when none could be read", () => {
    const bad = [
      { file: "C:\\aios\\events\\2026-10.jsonl", line: 1, reason: "x" },
      { file: "C:\\aios\\events\\2026-10.jsonl", line: 2, reason: "x" },
    ];
    const text = inboxEmptyText(bad);
    expect(text.title).toBe("No events could be read");
    expect(text.line).toBe(
      "Skipped 2 unreadable lines in the event files. First: 2026-10.jsonl line 1.",
    );
  });
});
