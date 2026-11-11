import type { DesktopUpdateState } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { AlertTriangleIcon, ChevronRightIcon, DownloadIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "../../lib/utils";
import {
  useDesktopUpdateState,
  useUpdateDetailsStore,
  useUpdatePreferencesStore,
} from "../../state/desktopUpdate";
import { runningThreadCountAtom } from "../../state/threads";
import { installDesktopUpdate, retryDesktopUpdateDownload } from "../desktopUpdate.actions";
import { resolveUpdatePill, summarizeUpdate } from "../desktopUpdate.logic";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { SidebarMenuItem } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const PILL_CLASS =
  "inline-flex h-7 items-center gap-2 rounded-full border border-sidebar-border bg-sidebar-control-surface text-xs text-sidebar-foreground outline-hidden ring-ring transition-colors hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-inset";

/** "Added a red helmet" becomes a bold verb and the rest, so a list scans by type. */
function NoteLine({ note }: { readonly note: string }) {
  const match = /^(Added|Fixed|Changed|Improved|Removed)\b\s*(.*)$/s.exec(note);
  return (
    <li className="flex gap-2 text-sm leading-snug text-muted-foreground">
      <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/70" />
      <span className="min-w-0 break-words">
        {match ? <b className="font-medium text-foreground">{match[1]} </b> : null}
        {match ? match[2] : note}
      </span>
    </li>
  );
}

function RestartCheck({
  runningCount,
  onKeepWaiting,
  onRestart,
}: {
  readonly runningCount: number;
  readonly onKeepWaiting: () => void;
  readonly onRestart: () => void;
}) {
  return (
    <div role="alertdialog" aria-label="Restart now" className="w-72 max-w-[calc(100vw-2rem)]">
      <h2 className="text-sm font-semibold">Restart now?</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {runningCount === 1
          ? "1 chat is still working. It stops if you restart now."
          : `${runningCount} chats are still working. They stop if you restart now.`}
      </p>
      <div className="mt-3 flex items-center justify-between">
        <Button size="sm" variant="ghost" onClick={onRestart}>
          Restart anyway
        </Button>
        <Button size="sm" onClick={onKeepWaiting}>
          Keep waiting
        </Button>
      </div>
    </div>
  );
}

function ReadyPill({
  state,
  expanded,
  className,
}: {
  readonly state: DesktopUpdateState;
  readonly expanded: boolean;
  readonly className: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const runningCount = useAtomValue(runningThreadCountAtom);
  const autoInstall = useUpdatePreferencesStore((store) => store.autoUpdateWhenSafe);
  const showDetails = useUpdateDetailsStore((store) => store.show);
  const summary = summarizeUpdate(state);
  const showMore = summary.moreCount > 0 || summary.spansReleases;
  const moreLabel = summary.moreCount > 0 ? `${summary.moreCount} more changes` : "More changes";

  const close = () => {
    setOpen(false);
    setConfirming(false);
  };
  const restart = () => {
    if (runningCount > 0) {
      setConfirming(true);
      return;
    }
    close();
    void installDesktopUpdate();
  };

  return (
    <SidebarMenuItem className={cn("shrink-0", className)}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setConfirming(false);
        }}
      >
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label="Update ready. Show what changed."
              className={cn(PILL_CLASS, expanded ? "pr-3 pl-2.5" : "w-7 justify-center")}
            />
          }
        >
          <span className="relative grid place-items-center">
            <DownloadIcon aria-hidden className="size-3.5" />
            <span
              aria-hidden
              className="absolute -top-1 -right-1 size-1.5 rounded-full bg-state ring-2 ring-sidebar-control-surface"
            />
          </span>
          {expanded ? <span className="whitespace-nowrap">Update ready</span> : null}
        </PopoverTrigger>
        <PopoverPopup side="top" align="start" aria-label="What changed in this update">
          {confirming ? (
            <RestartCheck
              runningCount={runningCount}
              onKeepWaiting={close}
              onRestart={() => {
                close();
                void installDesktopUpdate();
              }}
            />
          ) : (
            <div className="w-80 max-w-[calc(100vw-2rem)]">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">
                  Leonidas {summary.version ?? state.availableVersion ?? ""}
                </h2>
                <span className="rounded-full bg-state px-2 py-px text-3xs font-medium text-state-foreground">
                  Ready
                </span>
              </div>
              {summary.updateCount ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {summary.updateCount} updates since {state.currentVersion}
                </p>
              ) : null}
              {summary.highlights.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {summary.highlights.map((note) => (
                    <NoteLine key={note} note={note} />
                  ))}
                </ul>
              ) : null}
              {showMore && summary.version ? (
                <button
                  type="button"
                  className="mt-2 flex h-8 w-full items-center justify-between rounded-lg px-2 text-xs text-foreground outline-hidden ring-ring transition-colors hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-inset"
                  onClick={() => {
                    showDetails({ since: state.currentVersion, through: summary.version! });
                    close();
                  }}
                >
                  <span>{moreLabel}</span>
                  <ChevronRightIcon aria-hidden className="size-3.5 text-muted-foreground" />
                </button>
              ) : null}
              <div className="mt-2 flex items-center gap-3 border-t border-border pt-3">
                <p className="flex-1 text-xs text-muted-foreground">
                  {autoInstall
                    ? "Installs by itself when your AI is done, or when you quit."
                    : "Automatic install is off. Restart when you are ready."}
                </p>
                <Button size="sm" variant="outline" onClick={restart}>
                  Restart now
                </Button>
              </div>
            </div>
          )}
        </PopoverPopup>
      </Popover>
    </SidebarMenuItem>
  );
}

function PausedPill({
  state,
  expanded,
  className,
}: {
  readonly state: DesktopUpdateState;
  readonly expanded: boolean;
  readonly className: string | undefined;
}) {
  const reason =
    state.errorContext === "install"
      ? "The update could not install. Select to try again."
      : "The update could not download. Check your connection, then select to try again.";
  return (
    <SidebarMenuItem className={cn("shrink-0", className)}>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={`Update paused. ${reason}`}
              className={cn(
                PILL_CLASS,
                "text-warning-foreground",
                expanded ? "pr-3 pl-2.5" : "w-7 justify-center",
              )}
              onClick={() =>
                void (state.errorContext === "install"
                  ? installDesktopUpdate()
                  : retryDesktopUpdateDownload())
              }
            />
          }
        >
          <AlertTriangleIcon aria-hidden className="size-3.5" />
          {expanded ? <span className="whitespace-nowrap">Update paused</span> : null}
        </TooltipTrigger>
        <TooltipPopup side="top">{reason}</TooltipPopup>
      </Tooltip>
    </SidebarMenuItem>
  );
}

/**
 * The only update mark in the window: a small pill under the rail. It appears for notable updates
 * (or all updates, if the person chose that), and it never opens by itself.
 */
export function UpdateReadyPill({
  expanded = true,
  className,
}: {
  readonly expanded?: boolean;
  readonly className?: string | undefined;
}) {
  const state = useDesktopUpdateState();
  const level = useUpdatePreferencesStore((store) => store.updateNotice);
  const kind = resolveUpdatePill(state, level);
  if (!state || !kind) return null;
  return kind === "paused" ? (
    <PausedPill state={state} expanded={expanded} className={className} />
  ) : (
    <ReadyPill state={state} expanded={expanded} className={className} />
  );
}
