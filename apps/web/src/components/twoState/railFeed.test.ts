import { completeFeedEvent, type FeedEventDraft, type FoldedFeedEvent } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { actionLabel, eventIds, isEventRead, mergeDuplicateEvents, splitFeed } from "./railFeed";

const event = (
  title: string,
  extra: Partial<FeedEventDraft> = {},
  when = Date.UTC(2026, 9, 21, 12, 0, 0),
  count = 1,
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
  count,
});

describe("mergeDuplicateEvents", () => {
  it("merges 3 identical alerts across hours into 1 row with repeat count 3 and all ids", () => {
    const first = event(
      "Simplygersi mailpoller failed",
      {
        level: "failed",
        type: "script.failed",
        actor: { kind: "script", name: "Send-Notification.ps1" },
      },
      Date.UTC(2026, 9, 21, 8, 0, 0),
      1,
    );
    const second = event(
      "Simplygersi mailpoller failed",
      {
        level: "failed",
        type: "script.failed",
        actor: { kind: "script", name: "Send-Notification.ps1" },
      },
      Date.UTC(2026, 9, 21, 9, 0, 0),
      1,
    );
    const third = event(
      "Simplygersi mailpoller failed",
      {
        level: "failed",
        type: "script.failed",
        actor: { kind: "script", name: "Send-Notification.ps1" },
      },
      Date.UTC(2026, 9, 21, 10, 0, 0),
      1,
    );

    const merged = mergeDuplicateEvents([first, second, third], {});
    expect(merged).toHaveLength(1);
    expect(merged[0]!.id).toBe(third.id);
    expect(merged[0]!.count).toBe(3);
    expect(merged[0]!.firstTs).toBe(first.ts);
    expect(eventIds(merged[0]!)).toEqual([third.id, second.id, first.id]);
    expect(isEventRead(merged[0]!, { [third.id]: { read: true } })).toBe(false);
    expect(
      isEventRead(merged[0]!, {
        [first.id]: { read: true },
        [second.id]: { read: true },
        [third.id]: { read: true },
      }),
    ).toBe(true);
  });

  it("sums underlying server-folded counts and separates distinct targets", () => {
    const a1 = event(
      "Chat needs permission",
      { level: "needs_you", target: { thread: "thr_1" } },
      1000,
      2,
    );
    const a2 = event(
      "Chat needs permission",
      { level: "needs_you", target: { thread: "thr_1" } },
      2000,
      3,
    );
    const b1 = event(
      "Chat needs permission",
      { level: "needs_you", target: { thread: "thr_2" } },
      3000,
      1,
    );

    const merged = mergeDuplicateEvents([a1, a2, b1], {});
    expect(merged).toHaveLength(2);
    expect(merged.map((item) => item.count)).toEqual([1, 5]);
  });
});

describe("splitFeed", () => {
  const waiting = event("Leonidas needs your answer", { level: "needs_you" });
  const failed = event("Backup failed", { level: "failed", type: "script.failed" });
  const done = event("Leonidas finished");
  const answered = event("Old question", { level: "needs_you" });

  it("puts unread needs_you and failed events in Needs you, and the rest in Activity", () => {
    const split = splitFeed([waiting, failed, done, answered], { [answered.id]: { read: true } });
    expect(split.needsYou.map((item) => item.title)).toEqual([
      "Leonidas needs your answer",
      "Backup failed",
    ]);
    expect(split.activity.map((item) => item.title)).toEqual(["Leonidas finished", "Old question"]);
  });

  it("caps Activity so a long feed stays light", () => {
    const many = Array.from({ length: 30 }, (_, index) => event(`Event ${index}`));
    expect(splitFeed(many, {}, 5).activity).toHaveLength(5);
  });
});

describe("actionLabel", () => {
  it("uses the event's own first button", () => {
    const withButton = event("x", {
      actions: [{ label: "Open log", kind: "open_url", ref: "https://example.com" }],
    });
    expect(actionLabel(withButton)).toBe("Open log");
  });

  it("falls back to the target, and gives no button when there is nothing to open", () => {
    expect(actionLabel(event("x", { target: { thread: "thr_1" } }))).toBe("Open chat");
    expect(actionLabel(event("x", { target: { url: "https://example.com" } }))).toBe("Open link");
    expect(actionLabel(event("x"))).toBeNull();
  });
});
