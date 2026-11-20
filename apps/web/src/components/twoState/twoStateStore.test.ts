import { describe, expect, it } from "vite-plus/test";

import type { ThreadRouteTarget } from "~/threadRoutes";

import { SHELL_LAYOUT_STORAGE_KEY, useTwoStateStore } from "./twoStateStore";

describe("shell layout store", () => {
  it("starts on one full page, half and half when split, with the chat list open", () => {
    const { split, ratio, chatListOpen, lastThread, leftPage } = useTwoStateStore.getState();
    expect({ split, ratio, chatListOpen, lastThread, leftPage }).toEqual({
      split: false,
      ratio: 0.5,
      chatListOpen: true,
      lastThread: null,
      leftPage: null,
    });
  });

  it("keeps the layout under the versioned key and remembers the last chat and page", () => {
    const place = { environmentId: "env", threadId: "thr" };
    const page = { path: "/inbox", tab: null };
    useTwoStateStore.getState().setRatio(0.4);
    useTwoStateStore.getState().rememberThread(place);
    useTwoStateStore.getState().rememberLeftPage(page);
    expect(SHELL_LAYOUT_STORAGE_KEY).toBe("leonidas:shell-layout:v1");
    expect(useTwoStateStore.persist.getOptions().partialize?.(useTwoStateStore.getState())).toEqual(
      { split: false, ratio: 0.4, chatListOpen: true, lastThread: place, leftPage: page },
    );
  });

  it("remembers the chat behind a modal, ignores a new object for the same chat, and never saves it", () => {
    const chat = (threadId: string) =>
      ({ kind: "server", threadRef: { environmentId: "env", threadId } }) as ThreadRouteTarget;
    const draft = { kind: "draft", draftId: "d1" } as ThreadRouteTarget;
    const { rememberChatRoute } = useTwoStateStore.getState();
    rememberChatRoute(chat("a"));
    const first = useTwoStateStore.getState();
    rememberChatRoute(chat("a"));
    expect(useTwoStateStore.getState()).toBe(first);
    rememberChatRoute(chat("b"));
    expect(useTwoStateStore.getState().chatRoute).toEqual(chat("b"));
    rememberChatRoute(draft);
    expect(useTwoStateStore.getState().chatRoute).toEqual(draft);
    // A rail page has no chat: the next modal must not show an old one.
    rememberChatRoute(null);
    expect(useTwoStateStore.getState().chatRoute).toBeNull();
    expect(
      useTwoStateStore.persist.getOptions().partialize?.(useTwoStateStore.getState()),
    ).not.toHaveProperty("chatRoute");
  });

  it("turns the split off once for a layout saved by version 1", () => {
    const migrate = useTwoStateStore.persist.getOptions().migrate;
    expect(migrate?.({ split: true, ratio: 0.3 }, 1)).toEqual({ split: false, ratio: 0.3 });
    expect(migrate?.({ split: true, ratio: 0.3 }, 2)).toEqual({ split: true, ratio: 0.3 });
  });
});
