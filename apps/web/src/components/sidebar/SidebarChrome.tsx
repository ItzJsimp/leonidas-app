import { memo } from "react";
import { Link, useLocation } from "@tanstack/react-router";

import { APP_VERSION_LABEL } from "../../branding";
import { useEnvironmentIdentificationMode } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import {
  resolveEnvironmentIdentificationPillLabel,
  resolveSidebarStageBackdropVariant,
  SidebarStageBackdrop,
  useEnvironmentStageLabel,
} from "../SidebarStageBackdrop";
import { Badge } from "../ui/badge";
import { SidebarFooter, SidebarMenu, SidebarTrigger } from "../ui/sidebar";
import { SidebarThreadUndoNotice } from "./SidebarThreadUndoNotice";
import { SidebarNoAiBanner } from "./SidebarNoAiBanner";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarUpdateArchitectureWarning, SidebarUpdatePill } from "./SidebarUpdatePill";
import { openReleaseHistoryDialog } from "../desktop/ReleaseHistoryDialog";
import { observeResize } from "~/lib/observeResize";

export const SidebarChromeHeader = memo(function SidebarChromeHeader({
  isElectron,
}: {
  isElectron: boolean;
}) {
  const stageLabel = useEnvironmentStageLabel();
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const backdropVariant = resolveSidebarStageBackdropVariant(
    stageLabel,
    environmentIdentificationMode === "artwork",
  );
  const pillLabel =
    environmentIdentificationMode === "pill"
      ? resolveEnvironmentIdentificationPillLabel(stageLabel)
      : null;

  return (
    <div
      className={cn(
        "relative flex h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center gap-2 pr-3",
        isElectron && "drag-region",
      )}
    >
      {backdropVariant ? <SidebarStageBackdrop variant={backdropVariant} /> : null}
      <div className="relative top-[calc(var(--workspace-controls-top)-env(safe-area-inset-top))] z-10 ml-[calc(var(--workspace-controls-left)+1px-env(safe-area-inset-left))] flex shrink-0 items-center md:hidden">
        <SidebarTrigger
          variant={backdropVariant ? "media-navigation" : "ghost"}
          className="relative top-auto translate-y-0"
          aria-label="Toggle main sidebar"
        />
      </div>
      <div className="relative z-10 flex h-8 min-w-0 flex-1 flex-wrap content-start items-center gap-x-2 overflow-hidden py-0.5">
        <SidebarBrand onBackdrop={backdropVariant !== null} />
        {pillLabel ? (
          <div className="ml-1 flex h-7 items-center">
            <Badge data-environment-identification="pill" size="sm" variant="secondary">
              {pillLabel}
            </Badge>
          </div>
        ) : null}
        <button
          type="button"
          title="Version of Leonidas. Click to see what changed in each update."
          onClick={openReleaseHistoryDialog}
          className={cn(
            "h-7 shrink-0 rounded-md px-1 text-xs tabular-nums outline-hidden ring-ring focus-visible:ring-2 focus-visible:ring-inset",
            backdropVariant
              ? "text-white/70 hover:text-white"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          v{APP_VERSION_LABEL}
        </button>
      </div>
    </div>
  );
});

export function SidebarBrandWidthProbe({
  onWidthChange,
}: {
  onWidthChange: (width: number) => void;
}) {
  const observeWidth = (probe: HTMLDivElement) => {
    return observeResize(probe, ([entry]) => {
      if (entry) onWidthChange(entry.borderBoxSize[0]?.inlineSize ?? probe.offsetWidth);
    });
  };

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none invisible fixed top-0 left-0 flex w-max border-r border-transparent pr-3"
      ref={observeWidth}
    >
      <div className="ml-[var(--workspace-titlebar-content-left)] flex">
        <SidebarBrandMark onBackdrop={false} />
      </div>
    </div>
  );
}

function resolveCurrentAppName(pathname: string): string {
  if (pathname === "/command-center" || pathname.startsWith("/command-center/"))
    return "Command Center";
  if (pathname === "/scribe" || pathname.startsWith("/scribe/")) return "Scribe";
  if (pathname === "/images" || pathname.startsWith("/images/")) return "Images";
  if (pathname === "/brain" || pathname.startsWith("/brain/")) return "Brain";
  if (pathname === "/tasks" || pathname.startsWith("/tasks/")) return "Tasks";
  if (pathname === "/system-care" || pathname.startsWith("/system-care/")) return "Device Health";
  if (pathname === "/automations") return "Automations";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname === "/usage" || pathname.startsWith("/usage/")) return "Usage";
  if (pathname === "/pull-requests" || pathname.startsWith("/pull-requests/"))
    return "Pull requests";
  return "Chat";
}

function SidebarBrand({ onBackdrop }: { onBackdrop: boolean }) {
  const currentApp = useLocation({
    select: (location) => resolveCurrentAppName(location.pathname),
  });
  return (
    <Link
      aria-label={`Leonidas \u00b7 ${currentApp}`}
      className={cn(
        "relative z-10 ml-[var(--workspace-titlebar-content-left)] hidden h-7 w-fit min-w-0 shrink-0 items-center overflow-hidden rounded-md outline-hidden ring-ring focus-visible:ring-2 focus-visible:ring-inset md:flex",
        onBackdrop ? "text-white" : "text-foreground",
      )}
      to="/command-center"
    >
      <SidebarBrandMark onBackdrop={onBackdrop} currentApp={currentApp} />
    </Link>
  );
}

function SidebarBrandMark({
  onBackdrop,
  currentApp = "Chat",
}: {
  onBackdrop: boolean;
  currentApp?: string;
}) {
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1 text-sm font-medium tracking-tight">
      <span className="[text-box:trim-both_cap_alphabetic]">Leonidas</span>
      <span
        aria-hidden="true"
        className={cn(
          "text-xs select-none",
          onBackdrop ? "text-white/50" : "text-muted-foreground/50",
        )}
      >
        ·
      </span>
      <span
        className={cn(
          "truncate [text-box:trim-both_cap_alphabetic] supports-[text-box:trim-both_cap_alphabetic]:py-1",
          onBackdrop ? "text-white/70" : "text-muted-foreground",
        )}
      >
        {currentApp}
      </span>
    </span>
  );
}

export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  return (
    <SidebarFooter>
      <SidebarThreadUndoNotice />
      <SidebarNoAiBanner />
      <SidebarProviderUpdatePill />
      <SidebarUpdateArchitectureWarning />
      <SidebarMenu>
        <SidebarUpdatePill />
      </SidebarMenu>
    </SidebarFooter>
  );
});
