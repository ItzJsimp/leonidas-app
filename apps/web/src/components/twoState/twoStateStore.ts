import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "~/lib/storage";
import type { ThreadRouteTarget } from "~/threadRoutes";

import type { ThreadPlace } from "./swapKeys";

export const SHELL_LAYOUT_STORAGE_KEY = "leonidas:shell-layout:v1";

/** A rail page the left pane shows: its path and its open tab. */
export interface LeftPage {
  readonly path: string;
  readonly tab: string | null;
}

interface TwoStateState {
  /** Command Center (or a rail window) beside the chat when the window is wide enough. */
  readonly split: boolean;
  /** The left pane's share of the width, 0 to 1. */
  readonly ratio: number;
  /** The chat list column at the chat pane's left edge. */
  readonly chatListOpen: boolean;
  /** The chat the rail's Chat icon and the swap key return to. */
  readonly lastThread: ThreadPlace | null;
  /** The last rail page, so the left pane of the split keeps it while a chat is open. */
  readonly leftPage: LeftPage | null;
  /** The chat route the shell showed before a Settings or Usage modal opened. Not saved. */
  readonly chatRoute: ThreadRouteTarget | null;
  readonly setSplit: (split: boolean) => void;
  readonly setRatio: (ratio: number) => void;
  readonly setChatListOpen: (open: boolean) => void;
  readonly rememberThread: (place: ThreadPlace) => void;
  readonly rememberLeftPage: (page: LeftPage) => void;
  readonly rememberChatRoute: (target: ThreadRouteTarget | null) => void;
}

/** The router builds a new target object on every update, so compare the chat it names. */
const sameChatRoute = (a: ThreadRouteTarget | null, b: ThreadRouteTarget | null) =>
  a === null || b === null
    ? a === b
    : a.kind === "server"
      ? b.kind === "server" &&
        a.threadRef.environmentId === b.threadRef.environmentId &&
        a.threadRef.threadId === b.threadRef.threadId
      : b.kind === "draft" && a.draftId === b.draftId;

export const useTwoStateStore = create<TwoStateState>()(
  persist(
    (set) => ({
      split: false,
      ratio: 0.5,
      chatListOpen: true,
      lastThread: null,
      leftPage: null,
      chatRoute: null,
      setSplit: (split) => set({ split }),
      setRatio: (ratio) => set({ ratio }),
      setChatListOpen: (chatListOpen) => set({ chatListOpen }),
      rememberThread: (place) =>
        set((state) =>
          state.lastThread?.environmentId === place.environmentId &&
          state.lastThread.threadId === place.threadId
            ? state
            : { lastThread: place },
        ),
      rememberLeftPage: (page) =>
        set((state) =>
          state.leftPage?.path === page.path && state.leftPage.tab === page.tab
            ? state
            : { leftPage: page },
        ),
      rememberChatRoute: (chatRoute) =>
        set((state) => (sameChatRoute(state.chatRoute, chatRoute) ? state : { chatRoute })),
    }),
    {
      name: SHELL_LAYOUT_STORAGE_KEY,
      version: 2,
      // Version 1 opened split by default. The app now opens on one full page, so reset it once.
      migrate: (persisted, version) =>
        version < 2 ? { ...(persisted as object), split: false } : persisted,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: ({ split, ratio, chatListOpen, lastThread, leftPage }) => ({
        split,
        ratio,
        chatListOpen,
        lastThread,
        leftPage,
      }),
    },
  ),
);
