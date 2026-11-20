/**
 * The sidebar header (Jake's pick B2, 2026-11-07): a quiet New chat button, then search with one
 * More menu. The menu holds View options, Review old chats, Filter by project and Add project.
 *
 * The project scope picker is passed in: its combobox state lives with the rest of the sidebar's
 * scope logic. It has no trigger of its own. The More menu opens it, and it anchors to the search
 * field through `searchFieldRef`, as the View options panel does.
 */
import type { EnvironmentId, SidebarThreadSortOrder } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import {
  ChevronRightIcon,
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

/** One row style for New chat and every pinned tab, so the top of the panel reads as one list. */
const PANEL_ROW_CLASS =
  "flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-row-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none";
const PANEL_ROW_ICON_CLASS = "size-4 shrink-0 text-(--sidebar-icon-color)";

export interface SidebarThreadHeaderProps {
  searchFieldRef: RefObject<HTMLDivElement | null>;
  hasProjects: boolean;
  projectScope: ReactNode;
  /** The current scope, shown in the menu: "All projects" or the project names. */
  projectScopeLabel: string;
  onOpenProjectScope: () => void;
  sortOrder: SidebarThreadSortOrder;
  onSortOrderChange: (order: SidebarThreadSortOrder) => void;
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
  onOpenProjectScope,
  sortOrder,
  onSortOrderChange,
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
    <div className="flex flex-col gap-2">
      {/* New chat and the pinned tabs are one even list (Jake's sidebar pick, 2026-11-17). */}
      <div className="flex flex-col">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                data-usage-id="new_thread"
                aria-label={newThreadLabel}
                disabled={newThreadDisabled}
                onClick={onNewThread}
                className={cn(PANEL_ROW_CLASS, "disabled:pointer-events-none disabled:opacity-64")}
              />
            }
          >
            <SquarePenIcon aria-hidden className={PANEL_ROW_ICON_CLASS} />
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
      <div className="flex items-center gap-1">
        <div
          ref={searchFieldRef}
          className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-sidebar-muted-foreground hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-within:bg-sidebar-row-hover focus-within:text-sidebar-foreground focus-within:ring-1 focus-within:ring-inset focus-within:ring-ring/70"
        >
          <SearchIcon className="size-4 shrink-0 text-(--sidebar-icon-color)" />
          <SidebarInput
            ref={searchInputRef}
            nativeInput
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search"
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
          ) : null}
        </div>
        <Menu>
          <MenuTrigger render={<SidebarHeaderIconButton label="More" />}>
            <EllipsisIcon className="size-4" />
          </MenuTrigger>
          {/* No focus return: an item that opens a panel hands focus to that panel. */}
          <MenuPopup align="end" className="w-60" finalFocus={false}>
            <MenuItem onClick={() => setViewOpen(true)}>
              <SlidersHorizontalIcon />
              <span className="flex-1">View options</span>
              <MenuValue>{viewOptionsLabel(groupBy)}</MenuValue>
            </MenuItem>
            {pinnable.length > 0 ? (
              <MenuSub>
                <MenuSubTrigger>
                  <PencilIcon />
                  <MenuItemLabel>Edit tabs</MenuItemLabel>
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
            {canSweep ? (
              <MenuItem data-usage-id="thread_sweep" onClick={() => setSweepOpen(true)}>
                <HistoryIcon />
                <span className="flex-1">Review old chats</span>
              </MenuItem>
            ) : null}
            {hasProjects ? (
              <>
                <MenuItem onClick={onOpenProjectScope}>
                  <ListFilterIcon />
                  <span className="flex-1">Filter by project</span>
                  <MenuValue>{projectScopeLabel}</MenuValue>
                </MenuItem>
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
    <ul aria-label="Pinned tabs" className="flex flex-col">
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

/** A menu item's current value, muted, with an arrow: the item opens a panel to change it. */
function MenuValue({ children }: { children: ReactNode }) {
  return (
    <span className="flex max-w-28 min-w-0 items-center gap-0.5 text-xs text-muted-foreground">
      <span className="truncate">{children}</span>
      <ChevronRightIcon aria-hidden className="size-3.5 shrink-0" />
    </span>
  );
}

/**
 * Icon button with a tooltip, sized for the header. Spreads unknown props through so it can serve
 * as a popup trigger's render target, which injects its own handlers, ref and aria state.
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
            className={cn("relative size-7 shrink-0", className)}
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
