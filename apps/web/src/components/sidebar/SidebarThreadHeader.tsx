/**
 * The sidebar header (approved Option B, 2026-11-19):
 * 1. Top utility bar: Search field + dedicated Filter button + More options menu, above a hairline divider.
 * 2. Action & navigation block: New chat + Pinned tabs, separated from the scrollable chat list.
 */
import type { EnvironmentId, SidebarThreadSortOrder } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import {
  CheckCheckIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  CircleDotIcon,
  EllipsisIcon,
  FolderPlusIcon,
  HistoryIcon,
  LayoutDashboardIcon,
  ListFilterIcon,
  PencilIcon,
  PinOffIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  SquarePenIcon,
  XIcon,
} from "lucide-react";
import {
  useState,
  type ComponentProps,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { cn } from "~/lib/utils";
import { ThreadSweepDialog } from "../threadSweep/ThreadSweepDialog";
import { Button } from "../ui/button";
import {
  Menu,
  MenuCheckboxItem,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuItemLabel,
  MenuPopup,
  MenuSeparator,
  MenuSub,
  MenuSubPopup,
  MenuSubTrigger,
  MenuTrigger,
} from "../ui/menu";
import { SidebarInput, SidebarMenuButton } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { badgeText, ICONS } from "../twoState/AppRail";
import { railLinkLabel, type RailItem } from "../twoState/railItems";
import { useRailItems } from "../twoState/useRailItems";
import { useTwoStateCounts } from "../twoState/useTwoStateData";
import { Tip } from "../twoState/Tip";
import { SidebarViewMenu, viewOptionsLabel } from "./SidebarViewMenu";
import { useSidebarViewStore } from "./sidebarViewStore";

/** One row style for New chat and every pinned tab, so the nav block reads as one list. */
const PANEL_ROW_CLASS =
  "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-row-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none";
const PANEL_ROW_ICON_CLASS = "size-4 shrink-0 text-(--sidebar-icon-color)";

export interface SidebarThreadHeaderProps {
  searchFieldRef: RefObject<HTMLDivElement | null>;
  hasProjects: boolean;
  projectScope: ReactNode;
  /** The current scope, shown in the Filter tooltip: "All projects" or the project names. */
  projectScopeLabel: string;
  isProjectScoped?: boolean;
  onOpenProjectScope: () => void;
  sortOrder: SidebarThreadSortOrder;
  onSortOrderChange: (order: SidebarThreadSortOrder) => void;
  needsAttentionOnly?: boolean;
  onNeedsAttentionOnlyChange?: (value: boolean) => void;
  unreadCount?: number;
  onMarkAllRead?: () => void;
  anySectionExpanded?: boolean;
  onToggleCollapseAllSections?: () => void;
  /** Where Review old chats may run. Without a project folder the item stays out. */
  sweep: { readonly environmentId: EnvironmentId | null; readonly cwd: string | null };
  onNewProject: () => void;
  onNewThread: (event: ReactMouseEvent) => void;
  newThreadDisabled: boolean;
  newThreadShortcutLabel: string | null | undefined;
  newThreadInProjectShortcutLabel: string | null | undefined;
  showNewThreadInProjectHint: boolean;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSearchKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  isSearching: boolean;
  searchResultCount: number;
  activeSearchResultIndex: number;
  onClearSearch: () => void;
}

export function SidebarThreadHeader({
  searchFieldRef,
  hasProjects,
  projectScope,
  projectScopeLabel,
  isProjectScoped = false,
  onOpenProjectScope,
  sortOrder,
  onSortOrderChange,
  needsAttentionOnly = false,
  onNeedsAttentionOnlyChange,
  unreadCount = 0,
  onMarkAllRead,
  anySectionExpanded = true,
  onToggleCollapseAllSections,
  sweep,
  onNewProject,
  onNewThread,
  newThreadDisabled,
  newThreadShortcutLabel,
  newThreadInProjectShortcutLabel,
  showNewThreadInProjectHint,
  searchInputRef,
  searchQuery,
  onSearchQueryChange,
  onSearchKeyDown,
  isSearching,
  searchResultCount,
  activeSearchResultIndex,
  onClearSearch,
}: SidebarThreadHeaderProps) {
  const [viewOpen, setViewOpen] = useState(false);
  const [sweepOpen, setSweepOpen] = useState(false);
  const groupBy = useSidebarViewStore((store) => store.view.groupBy);
  const resultsVisible = isSearching && searchResultCount > 0;
  // Results shrink as the query narrows, so the active index can outrun the
  // list; pointing aria-activedescendant at a removed option strands the
  // screen reader on nothing.
  const activeResultExists = resultsVisible && activeSearchResultIndex < searchResultCount;
  const newThreadLabel = newThreadShortcutLabel
    ? `New chat (${newThreadShortcutLabel})`
    : "New chat";
  const canSweep = sweep.environmentId !== null && sweep.cwd !== null;
  const { pinned, pinnable, togglePin } = useRailItems();

  return (
    <div className="flex flex-col gap-3">
      {/* Top utility bar: Search + Filter + More above a hairline divider. */}
      <div className="flex items-center gap-1.5 border-b border-sidebar-border/65 pb-3">
        <div
          ref={searchFieldRef}
          className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-sidebar-border bg-sidebar-control-surface px-2 text-sm text-sidebar-muted-foreground transition-colors hover:border-input hover:text-sidebar-foreground focus-within:border-input focus-within:text-sidebar-foreground focus-within:ring-1 focus-within:ring-inset focus-within:ring-ring/70 motion-reduce:transition-none"
        >
          <SearchIcon aria-hidden className="size-3.5 shrink-0 text-(--sidebar-icon-color)" />
          <SidebarInput
            ref={searchInputRef}
            nativeInput
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search chats..."
            aria-label="Search chats"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={resultsVisible}
            aria-controls={resultsVisible ? "sidebar-thread-search-results" : undefined}
            aria-activedescendant={
              activeResultExists
                ? `sidebar-thread-search-result-${activeSearchResultIndex}`
                : undefined
            }
            className="min-w-0 flex-1"
          />
          {isSearching ? (
            <Button
              type="button"
              size="icon-micro"
              variant="ghost-muted"
              className="shrink-0"
              aria-label="Clear chat search"
              onClick={() => {
                onClearSearch();
                searchInputRef.current?.focus();
              }}
            >
              <XIcon className="size-3" />
            </Button>
          ) : (
            <kbd
              aria-hidden
              className="shrink-0 rounded-sm border border-sidebar-border bg-background px-1 font-mono text-3xs leading-4 text-sidebar-muted-foreground"
            >
              /
            </kbd>
          )}
        </div>

        {hasProjects ? (
          <SidebarHeaderIconButton
            label="Filter by project"
            tooltip={`Filter by project (${projectScopeLabel})`}
            variant={isProjectScoped ? "outline" : "default"}
            onClick={onOpenProjectScope}
          >
            <ListFilterIcon className="size-4" />
            {isProjectScoped ? (
              <span
                aria-hidden
                data-testid="sidebar-filter-active-dot"
                className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-state"
              />
            ) : null}
          </SidebarHeaderIconButton>
        ) : null}

        <Menu>
          <MenuTrigger
            render={<SidebarHeaderIconButton label="More options" tooltip="More options" />}
          >
            <EllipsisIcon className="size-4" />
          </MenuTrigger>
          {/* No focus return: an item that opens a panel hands focus to that panel. */}
          <MenuPopup align="end" className="w-64" finalFocus={false}>
            <MenuGroup>
              <MenuGroupLabel>Customize</MenuGroupLabel>
              <MenuItem onClick={() => setViewOpen(true)}>
                <SlidersHorizontalIcon />
                <span className="flex-1">Display options</span>
                <span className="rounded-sm border border-border bg-background px-1.5 py-0.5 text-2xs text-muted-foreground">
                  {viewOptionsLabel(groupBy)}
                </span>
              </MenuItem>
              <MenuCheckboxItem
                variant="switch"
                checked={needsAttentionOnly}
                onCheckedChange={(checked) => onNeedsAttentionOnlyChange?.(checked)}
              >
                <span className="flex items-center gap-2">
                  <CircleDotIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <span>Needs attention</span>
                </span>
              </MenuCheckboxItem>
              {pinnable.length > 0 ? (
                <MenuSub>
                  <MenuSubTrigger>
                    <PencilIcon />
                    <MenuItemLabel>Edit tabs</MenuItemLabel>
                    <span className="ms-auto text-xs tabular-nums text-muted-foreground">
                      {pinned.length} pinned
                    </span>
                  </MenuSubTrigger>
                  <MenuSubPopup>
                    {pinnable.map((item) => (
                      <MenuCheckboxItem
                        key={item.id}
                        checked={pinned.some((entry) => entry.id === item.id)}
                        onCheckedChange={(on) => togglePin(item.id, on)}
                      >
                        {item.label}
                      </MenuCheckboxItem>
                    ))}
                  </MenuSubPopup>
                </MenuSub>
              ) : null}
            </MenuGroup>

            <MenuSeparator />

            <MenuGroup>
              <MenuGroupLabel>Actions</MenuGroupLabel>
              <MenuItem disabled={unreadCount === 0} onClick={() => onMarkAllRead?.()}>
                <CheckCheckIcon />
                <span className="flex-1">Mark all read</span>
                {unreadCount > 0 ? (
                  <span className="rounded-sm border border-border bg-background px-1.5 py-0.5 text-2xs tabular-nums text-muted-foreground">
                    {unreadCount}
                  </span>
                ) : null}
              </MenuItem>
              <MenuItem onClick={() => onToggleCollapseAllSections?.()}>
                {anySectionExpanded ? <ChevronsDownUpIcon /> : <ChevronsUpDownIcon />}
                <span className="flex-1">
                  {anySectionExpanded ? "Collapse all sections" : "Expand all sections"}
                </span>
              </MenuItem>
              {canSweep ? (
                <MenuItem data-usage-id="thread_sweep" onClick={() => setSweepOpen(true)}>
                  <HistoryIcon />
                  <span className="flex-1">Review old chats</span>
                  <span className="text-2xs text-muted-foreground">AI sweep</span>
                </MenuItem>
              ) : null}
            </MenuGroup>

            {hasProjects ? (
              <>
                <MenuSeparator />
                <MenuItem onClick={onNewProject}>
                  <FolderPlusIcon />
                  <span className="flex-1">Add project</span>
                </MenuItem>
              </>
            ) : null}
          </MenuPopup>
        </Menu>
      </div>

      {/* New chat and pinned rail tabs below the top utility divider. */}
      <div className="flex flex-col gap-0.5 border-b border-sidebar-border/70 pb-2.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                data-usage-id="new_thread"
                aria-label={newThreadLabel}
                disabled={newThreadDisabled}
                onClick={onNewThread}
                className={cn(
                  PANEL_ROW_CLASS,
                  "font-medium disabled:pointer-events-none disabled:opacity-64",
                )}
              />
            }
          >
            <SquarePenIcon aria-hidden className="size-4 shrink-0 text-primary" />
            <span className="flex-1 text-left">New chat</span>
            {newThreadShortcutLabel ? (
              <kbd className="font-sans text-2xs text-sidebar-muted-foreground">
                {newThreadShortcutLabel}
              </kbd>
            ) : null}
          </TooltipTrigger>
          <TooltipPopup side="bottom">
            {showNewThreadInProjectHint ? (
              <span className="flex flex-col gap-0.5">
                <span>{newThreadLabel}</span>
                <span className="text-muted-foreground">
                  New thread in current project: Shift+click
                  {newThreadInProjectShortcutLabel ? ` (${newThreadInProjectShortcutLabel})` : ""}
                </span>
              </span>
            ) : (
              newThreadLabel
            )}
          </TooltipPopup>
        </Tooltip>
        <PinnedTabs pinned={pinned} onToggle={togglePin} />
      </div>

      {hasProjects ? projectScope : null}
      <SidebarViewMenu
        open={viewOpen}
        onOpenChange={setViewOpen}
        anchor={searchFieldRef}
        sortOrder={sortOrder}
        onSortOrderChange={onSortOrderChange}
      />
      {sweepOpen && sweep.environmentId && sweep.cwd ? (
        <ThreadSweepDialog
          environmentId={sweep.environmentId}
          cwd={sweep.cwd}
          onClose={() => setSweepOpen(false)}
        />
      ) : null}
    </div>
  );
}

/**
 * Rail tabs pinned under New chat (Jake's sidebar pick, 2026-11-17). A pinned tab stays on the rail
 * too: this list shows on the Chat page alone. Counts share one fixed width so they line up. Hover
 * shows the unpin button in the count's place. Edit tabs lives in the More menu (Jake, 2026-11-18).
 */
function PinnedTabs({
  pinned,
  onToggle,
}: {
  pinned: readonly RailItem[];
  onToggle: (id: string, on: boolean) => void;
}) {
  const needsYou = useTwoStateCounts().needsYou ?? 0;
  if (pinned.length === 0) return null;
  return (
    <ul aria-label="Pinned tabs" className="flex flex-col gap-0.5">
      {pinned.map((item) => {
        const Icon = ICONS[item.id] ?? LayoutDashboardIcon;
        const count = item.id === "inbox" ? needsYou : 0;
        return (
          <li key={item.id} className="group/pin relative">
            <Tip text={item.tooltip}>
              <Link
                to={item.to}
                aria-label={railLinkLabel(item.label, count)}
                className={PANEL_ROW_CLASS}
              >
                <Icon aria-hidden className={PANEL_ROW_ICON_CLASS} />
                <span className="flex-1 truncate">{item.label}</span>
                {count > 0 ? (
                  <span
                    aria-hidden
                    className="grid h-[18px] w-7 shrink-0 place-items-center rounded-full bg-sidebar-control-surface text-2xs font-semibold tabular-nums group-hover/pin:invisible group-focus-within/pin:invisible"
                  >
                    {badgeText(count)}
                  </span>
                ) : null}
              </Link>
            </Tip>
            <Tip text={`Unpin ${item.label} from this list`}>
              <button
                type="button"
                aria-label={`Unpin ${item.label}`}
                onClick={() => onToggle(item.id, false)}
                className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md text-sidebar-muted-foreground opacity-0 transition-opacity group-hover/pin:opacity-100 hover:text-sidebar-foreground focus-visible:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
              >
                <PinOffIcon aria-hidden className="size-3.5" />
              </button>
            </Tip>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Icon button with a tooltip, sized for the top header bar. Spreads unknown props through so it can
 * serve as a popup trigger's render target, which injects its own handlers, ref and aria state.
 */
function SidebarHeaderIconButton({
  label,
  tooltip = label,
  className,
  children,
  ...rest
}: {
  label: string;
  tooltip?: ReactNode;
  className?: string | undefined;
  children?: ReactNode;
} & Omit<
  ComponentProps<typeof SidebarMenuButton>,
  "children" | "className" | "tooltip" | "isActive" | "aria-label"
>) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <SidebarMenuButton
            size="icon"
            type="button"
            aria-label={label}
            {...rest}
            className={cn("relative shrink-0", className)}
          />
        }
      >
        {children}
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden"
        />
      </TooltipTrigger>
      <TooltipPopup side="top">{tooltip}</TooltipPopup>
    </Tooltip>
  );
}
