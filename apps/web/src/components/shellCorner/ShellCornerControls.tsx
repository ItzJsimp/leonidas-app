import { useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";
import { BellIcon, LayoutPanelLeftIcon } from "lucide-react";
import { useLayoutEffect } from "react";

import { shortcutLabelForCommand } from "~/keybindings";
import { primaryServerKeybindingsAtom } from "~/state/server";

import { badgeText } from "../twoState/AppRail";
import { railLinkLabel } from "../twoState/railItems";
import { SPLIT_MIN_WIDTH } from "../twoState/shellLayout";
import { Tip } from "../twoState/Tip";
import { useTwoStateStore } from "../twoState/twoStateStore";
import { useTwoStateCounts } from "../twoState/useTwoStateData";
import { useViewportWidth } from "../twoState/useViewportWidth";
import { Button } from "../ui/button";
import { Toggle } from "../ui/toggle";
import { useClaimShellCorner, useShellCornerClaimed } from "./shellCornerHost";

/**
 * The right end of the layout cluster on every page: the split view toggle and the
 * notifications bell. A page cluster that renders it with `claim` owns the corner.
 */
export function ShellCornerControls({ claim = false }: { readonly claim?: boolean }) {
  useClaimShellCorner(claim);
  return (
    <div className="flex shrink-0 items-center gap-1 [-webkit-app-region:no-drag]">
      <SplitViewToggle />
      <NotificationsBell />
    </div>
  );
}

/**
 * The app shell's copy, for pages with no cluster of their own (no chat open). While it shows,
 * `data-shell-corner` on the root lets page headers keep their right end clear of it.
 */
export function ShellCornerFallback() {
  const claimed = useShellCornerClaimed();
  useLayoutEffect(() => {
    if (claimed) return;
    const root = document.documentElement;
    root.dataset.shellCorner = "";
    return () => {
      delete root.dataset.shellCorner;
    };
  }, [claimed]);
  if (claimed) return null;
  return (
    <div
      className="fixed top-[var(--workspace-controls-top)] right-[var(--workspace-controls-right)] z-[45] mr-px flex h-[var(--workspace-topbar-height)] items-center [-webkit-app-region:no-drag]"
      data-workspace-titlebar-controls
    >
      <ShellCornerControls />
    </div>
  );
}

function NotificationsBell() {
  const count = useTwoStateCounts().needsYou ?? 0;
  const label = railLinkLabel("Notifications", count);
  return (
    <Tip text={label}>
      <Button
        variant="ghost"
        size={count > 0 ? "sm" : "icon-sm"}
        aria-label={label}
        render={
          <Link
            to="/inbox"
            className={
              count > 0
                ? "gap-1.5 px-1.5 [-webkit-app-region:no-drag]"
                : "[-webkit-app-region:no-drag]"
            }
          />
        }
      >
        <BellIcon className="size-4 shrink-0" />
        {count > 0 ? (
          <span
            aria-hidden
            className="min-w-4 rounded-full bg-warning px-1.5 text-center text-3xs leading-4 font-semibold text-background tabular-nums"
          >
            {badgeText(count)}
          </span>
        ) : null}
      </Button>
    </Tip>
  );
}

/** Shows the left page beside the chat. Hidden where the window is too narrow to split. */
function SplitViewToggle() {
  const split = useTwoStateStore((state) => state.split);
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const wide = useViewportWidth() >= SPLIT_MIN_WIDTH;
  if (!wide) return null;
  const shortcut = shortcutLabelForCommand(keybindings, "layout.split");
  return (
    <Tip text={`Split view: show this page beside the chat${shortcut ? ` (${shortcut})` : ""}`}>
      <Toggle
        className="shrink-0 [-webkit-app-region:no-drag]"
        pressed={split}
        onPressedChange={(pressed) => useTwoStateStore.getState().setSplit(pressed)}
        aria-label="Split view"
        variant="ghost"
        size="sm"
      >
        <LayoutPanelLeftIcon className="size-4" />
      </Toggle>
    </Tip>
  );
}
