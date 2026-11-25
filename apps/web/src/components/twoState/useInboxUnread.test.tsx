// @vitest-environment jsdom
import { completeFeedEvent, type FoldedFeedEvent } from "@t3tools/contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vite-plus/test";

const makeEvent = (
  id: string,
  title: string,
  level: "needs_you" | "failed" | "info",
  when: number,
): FoldedFeedEvent => ({
  ...completeFeedEvent(
    {
      level,
      type:
        level === "failed"
          ? "script.failed"
          : level === "needs_you"
            ? "agent.needs_permission"
            : "agent.finished",
      title,
      actor: { kind: "agent", name: "Leonidas" },
    },
    when,
  ),
  id,
  count: 1,
});

const events: FoldedFeedEvent[] = [
  makeEvent("dup-1", "Mailpoller failed", "failed", 1000),
  makeEvent("dup-2", "Mailpoller failed", "failed", 2000),
  makeEvent("dup-3", "Mailpoller failed", "failed", 3000),
  makeEvent("ask-1", "Approve git push", "needs_you", 4000),
  makeEvent("info-1", "Tests finished", "info", 5000),
];

vi.mock("~/components/workspace/useActiveAiosWorkspace", () => ({
  useActiveAiosWorkspace: () => ({ environmentId: "env-1", scopeReady: true, scope: {} }),
}));
vi.mock("~/state/eventFeed", () => ({ eventFeedLive: () => "feed-query" }));
vi.mock("~/state/query", () => ({
  useEnvironmentQuery: (query: unknown) => ({ data: query === null ? undefined : { events } }),
}));

import { useEventFeedStore } from "~/eventFeedStore";
import { useInboxUnread } from "./useInboxUnread";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("useInboxUnread", () => {
  it("counts only distinct unread Needs you alerts and ignores duplicates and info updates", () => {
    let seen = -1;
    function Probe() {
      seen = useInboxUnread();
      return null;
    }
    const root = createRoot(document.createElement("div"));
    act(() => root.render(<Probe />));
    // 3 duplicate failures merge into 1 + 1 approval = 2 (info update is excluded).
    expect(seen).toBe(2);

    act(() => useEventFeedStore.getState().markRead(["dup-1", "dup-2", "dup-3"]));
    expect(seen).toBe(1);

    act(() => useEventFeedStore.getState().dismiss("ask-1"));
    expect(seen).toBe(0);
    act(() => root.unmount());
  });
});
