import { Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { LayoutDashboardIcon } from "lucide-react";

import { TeamLensProvider } from "~/components/team/TeamLensContext";
import { WorkspacePageHeader } from "~/components/WorkspacePageHeader";
import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import { isElectron } from "~/env";
import { useIsShortTouchScreen } from "~/hooks/useMediaQuery";
import { observeResize } from "~/lib/observeResize";
import { cn } from "~/lib/utils";
import type { ThreadRouteTarget } from "~/threadRoutes";

import { ChatPane } from "./ChatPane";
import { CodeForwardContext } from "./codeForwardContext";
import { CommandCenterForward } from "./CommandCenterForward";
import { DIVIDER_PX, PaneDivider } from "./PaneDivider";
import { clampRatio, DRAWER_BELOW_WIDTH, paneLayout } from "./shellLayout";
import { isLeftPagePath, LeftPagePane } from "./leftPages";
import { HomeCardsOutlet } from "./SlotOutlet";
import { useTwoStateStore } from "./twoStateStore";
import { useViewportWidth } from "./useViewportWidth";

const CC_CONTEXT = { forward: "cc" } as const;

/**
 * The shell body: a rail window (or the Command Center home) on the left and the chat on the
 * right, with a divider. Below 1280 px one pane shows and the rail switches panes. The chat
 * pane keeps one slot in this tree, so it does not remount when the left pane changes.
 */
export function ShellSplit({
  threadTarget,
  modalOpen = false,
}: {
  readonly threadTarget: ThreadRouteTarget | null;
  /** A Settings or Usage modal is open: keep the last panes behind it and render it from the outlet. */
  readonly modalOpen?: boolean;
}) {
  const width = useViewportWidth();
  const isShortTouchScreen = useIsShortTouchScreen();
  const split = useTwoStateStore((state) => state.split);
  const ratio = useTwoStateStore((state) => state.ratio);
  const setRatio = useTwoStateStore((state) => state.setRatio);
  const rememberThread = useTwoStateStore((state) => state.rememberThread);
  const leftPage = useTwoStateStore((state) => state.leftPage);
  const rememberLeftPage = useTwoStateStore((state) => state.rememberLeftPage);
  const path = useLocation({ select: (location) => location.pathname });
  const tab = useLocation({
    select: (location) => (location.search as { readonly tab?: unknown }).tab,
  });
  const rowRef = useRef<HTMLDivElement>(null);
  const [rowWidth, setRowWidth] = useState(0);

  const place = threadTarget?.kind === "server" ? threadTarget.threadRef : null;
  useEffect(() => {
    if (place) rememberThread(place);
  }, [place, rememberThread]);
  // The rail page in the URL is the left pane's page. A chat opened next keeps it on the left.
  const windowPath = threadTarget ? null : path;
  const windowTab = typeof tab === "string" ? tab : null;
  useEffect(() => {
    if (windowPath !== null && isLeftPagePath(windowPath)) {
      rememberLeftPage({ path: windowPath, tab: windowTab });
    }
  }, [windowPath, windowTab, rememberLeftPage]);
  const layout = paneLayout({ width, split, routeKind: threadTarget ? "thread" : "window" });
  const chatBeside = layout.mode === "split";
  // Only the split view uses the row width. Outside it, a rail toggle must not re-render the pane.
  useLayoutEffect(() => {
    const element = rowRef.current;
    if (!element || !chatBeside) return;
    return observeResize(element, ([entry]) => {
      if (entry) setRowWidth(entry.contentRect.width);
    });
  }, [chatBeside]);
  const value = useMemo(() => ({ rails: false, chatBeside }), [chatBeside]);

  const showLeft = layout.mode === "split" || layout.show === "left";
  const showChat = layout.mode === "split" || layout.show === "chat";
  // While dragging the pane follows the pointer; the store gets the ratio on pointer up only.
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const share = clampRatio(dragRatio ?? ratio, rowWidth);

  return (
    <CodeForwardContext value={value}>
      <div ref={rowRef} className="flex h-svh min-h-0 min-w-0 flex-1 md:h-dvh">
        {showLeft ? (
          <div
            data-pane="left"
            style={
              layout.mode === "split"
                ? { width: `calc((100% - ${DIVIDER_PX}px) * ${share})` }
                : undefined
            }
            className={cn(
              "flex min-h-0 min-w-0 flex-col",
              layout.mode === "split" ? "shrink-0" : "flex-1",
            )}
          >
            {!threadTarget && !modalOpen ? (
              <Outlet />
            ) : leftPage && leftPage.path !== "/command-center" ? (
              <LeftPagePane page={leftPage} />
            ) : (
              <CommandCenterHome />
            )}
          </div>
        ) : null}
        {layout.mode === "split" ? (
          <PaneDivider
            ratio={share}
            containerRef={rowRef}
            onDrag={setDragRatio}
            onChange={(next) => {
              setRatio(next);
              setDragRatio(null);
            }}
          />
        ) : null}
        {showChat ? (
          <ChatPane
            urlTarget={threadTarget}
            reserveTop={width < DRAWER_BELOW_WIDTH || isShortTouchScreen}
          />
        ) : null}
      </div>
      {modalOpen ? <Outlet /> : null}
    </CodeForwardContext>
  );
}

/** The left pane while a chat is open: the Command Center as it looks when forward. */
function CommandCenterHome(): ReactNode {
  const { scope } = useActiveAiosWorkspace();
  return (
    <TeamLensProvider scopeKey={JSON.stringify(scope)}>
      <section aria-label="Command Center" className="flex min-h-0 flex-1 flex-col bg-background">
        {/* The same top bar as the full page, so the window drags from here too. */}
        <WorkspacePageHeader electron={isElectron} reserveNativeControls={false}>
          <LayoutDashboardIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <p className="truncate text-sm font-medium">Command Center</p>
        </WorkspacePageHeader>
        <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto p-6">
          <CommandCenterForward />
          <HomeCardsOutlet context={CC_CONTEXT} />
        </div>
      </section>
    </TeamLensProvider>
  );
}
