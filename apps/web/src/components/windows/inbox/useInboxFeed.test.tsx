// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  events: [{ id: "dismissed" }],
  bad: [{ file: "events/2026-10.jsonl", line: 2, reason: "bad JSON" }],
}));
vi.mock("~/components/workspace/useActiveAiosWorkspace", () => ({
  useActiveAiosWorkspace: () => ({ environmentId: "env-1", scopeReady: true, scope: {} }),
}));
vi.mock("~/state/eventFeed", () => ({ eventFeedLive: () => "feed" }));
vi.mock("~/state/query", () => ({
  useEnvironmentQuery: () => ({ data: state, error: null }),
}));
vi.mock("../../twoState/useTwoStateData", () => ({ useFeedEvents: () => [] }));

import { inboxEmptyText } from "./inbox.logic";
import { useInboxFeed } from "./useInboxFeed";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("inbox empty state", () => {
  it("does not report an unreadable feed after all valid events are dismissed", () => {
    function Probe() {
      const feed = useInboxFeed();
      return <p>{inboxEmptyText(feed.bad).title}</p>;
    }
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      act(() => root.render(<Probe />));
      expect(container.textContent).toBe("No notifications.");
      state.events = [];
      act(() => root.render(<Probe />));
      expect(container.textContent).toBe("No events could be read");
    } finally {
      act(() => root.unmount());
    }
  });
});
