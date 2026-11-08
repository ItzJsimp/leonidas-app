import { Link, useLocation, useParams } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import {
  AudioLinesIcon,
  BellIcon,
  BotIcon,
  BrainIcon,
  ChartNoAxesColumnIcon,
  ChevronsUpDownIcon,
  ClapperboardIcon,
  FolderKanbanIcon,
  ImageIcon,
  LayoutDashboardIcon,
  LibraryIcon,
  ListChecksIcon,
  MegaphoneIcon,
  MessageSquareIcon,
  MicIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PaperclipIcon,
  SettingsIcon,
  SunIcon,
  TerminalSquareIcon,
  UsersIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";

import { SidebarUpdatePill } from "~/components/sidebar/SidebarUpdatePill";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { ScrollArea } from "~/components/ui/scroll-area";
import { SidebarMenu } from "~/components/ui/sidebar";
import { WorkspaceMenu } from "~/components/workspace/WorkspaceSwitcher";
import { useActiveAiosWorkspace } from "~/components/workspace/useActiveAiosWorkspace";
import {
  useWorkspacePictures,
  WorkspacePicture,
  WorkspaceTypeChip,
} from "~/components/workspace/WorkspacePicture";
import { isElectron } from "~/env";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { cn, isMacPlatform } from "~/lib/utils";
import { usePrimaryEnvironment } from "~/state/environments";
import {
  EMPTY_SETUP_STATE,
  SETUP_STATE_STORAGE_KEY,
  SetupStateSchema,
} from "~/onboarding/setupState.logic";
import { resolveThreadRouteTarget } from "~/threadRoutes";

import {
  activeRailId,
  badgeAnnouncement,
  RAIL_GROUP_LABELS,
  railItems,
  railLinkLabel,
  type RailItem,
} from "./railItems";
import { Tip } from "./Tip";
import { useRailShowAnyway } from "./useRailShowAnyway";
import { useTwoStateStore } from "./twoStateStore";
import { useTwoStateCounts } from "./useTwoStateData";

const ICONS: Readonly<Record<string, LucideIcon>> = {
  "command-center": LayoutDashboardIcon,
  chat: MessageSquareIcon,
  scribe: MicIcon,
  meetings: AudioLinesIcon,
  inbox: BellIcon,
  today: SunIcon,
  tasks: ListChecksIcon,
  projects: FolderKanbanIcon,
  memory: BrainIcon,
  library: LibraryIcon,
  content: MegaphoneIcon,
  deals: ClapperboardIcon,
  images: ImageIcon,
  files: PaperclipIcon,
  automations: ZapIcon,
  subagents: BotIcon,
  team: UsersIcon,
  developer: TerminalSquareIcon,
  usage: ChartNoAxesColumnIcon,
  settings: SettingsIcon,
};

const TARGET_CLASS =
  "relative inline-flex size-9 shrink-0 touch-hit items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none [-webkit-app-region:no-drag]";
// The current page takes the action color on a faint tint (DESIGN.md "Rail").
const ACTIVE_CLASS = "border-transparent bg-primary/14 text-primary hover:text-primary";
const CONTROL_CLASS =
  "inline-flex shrink-0 touch-hit items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none [-webkit-app-region:no-drag]";

/** The rail remembers whether it shows labels. Labels by default (Jake's pick, 2026-11-07). */
export const RAIL_EXPANDED_KEY = "leonidas:rail-expanded";

/** "99+" past 99, so the badge stays small. */
export const badgeText = (count: number) => (count > 99 ? "99+" : String(count));

/**
 * The only app navigation, in flat groups. Expanded shows labels and group names. Collapsed shows
 * icons with thin dividers. `drawer` is the narrow-window sheet: always expanded, no toggle.
 * Chat opens the last chat, else the chat start page.
 */
export function AppRail({ drawer = false }: { readonly drawer?: boolean }) {
  const [stored, setStored] = useLocalStorage(RAIL_EXPANDED_KEY, true, Schema.Boolean);
  const expanded = drawer || stored;
  const { active } = useActiveAiosWorkspace();
  const [setup] = useLocalStorage(SETUP_STATE_STORAGE_KEY, EMPTY_SETUP_STATE, SetupStateSchema);
  const { shown: showAnyway } = useRailShowAnyway(active?.id);
  const lastThread = useTwoStateStore((state) => state.lastThread);
  // Same number as the Needs you tile and card: the badge counts what needs you.
  const unread = useTwoStateCounts().needsYou;
  const [announcement, setAnnouncement] = useState("");
  const previousUnread = useRef<number | null>(null);
  useEffect(() => {
    const text = badgeAnnouncement(previousUnread.current, unread);
    previousUnread.current = unread;
    if (text) setAnnouncement(text);
  }, [unread]);
  const pathname = useLocation({ select: (location) => location.pathname });
  const onChat = useParams({
    strict: false,
    select: (params) => resolveThreadRouteTarget(params) !== null,
  });
  const scribeSupported =
    usePrimaryEnvironment()?.serverConfig?.environment.platform.os === "windows";
  const { main, bottom } = railItems({
    business: active?.type === "business",
    builder: setup.coder === true,
    showAnyway,
    scribe: scribeSupported,
  });
  const current = activeRailId(pathname, onChat);
  const renderItem = (item: RailItem) => (
    <RailLink
      key={item.id}
      item={item}
      current={item.id === current}
      lastThread={lastThread}
      expanded={expanded}
      badge={item.id === "inbox" ? (unread ?? 0) : 0}
    />
  );
  return (
    <nav
      aria-label="Main"
      className={cn(
        "flex h-full shrink-0 flex-col gap-1 border-r border-border bg-card pb-2",
        // Empty rail space moves the window, as a title bar does. Its links and buttons stay clickable.
        isElectron && "drag-region",
        drawer ? "w-full px-2" : expanded ? "w-56 px-2" : "w-[52px] items-center",
        isElectron && isMacPlatform(navigator.platform) ? "pt-10" : "pt-2",
      )}
    >
      <RailHeader
        expanded={expanded}
        needsYou={unread}
        onToggle={drawer ? null : () => setStored(!expanded)}
      />
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
      {/* The fade shows only on the edge that has more rows. Rows are links, so the list needs no tab stop. */}
      <ScrollArea
        scrollFade
        viewportTabIndex={-1}
        // A row is 38 px high: the fade must reach into the next row, or the cue is invisible.
        className="mt-1 flex-1 [&_[data-slot=scroll-area-viewport]]:[--fade-size:3rem]"
      >
        <div className={cn("flex flex-col gap-0.5", !expanded && "items-center")}>
          {main.map((item, index) => {
            const first = index === 0 || main[index - 1]!.group !== item.group;
            return (
              <Fragment key={item.id}>
                {first && expanded ? (
                  <p
                    aria-hidden
                    className={cn(
                      "px-2.5 pb-1 text-3xs font-semibold tracking-wider text-muted-foreground uppercase",
                      index === 0 ? "pt-1" : "pt-3",
                    )}
                  >
                    {RAIL_GROUP_LABELS[item.group]}
                  </p>
                ) : null}
                {first && !expanded && index > 0 ? (
                  <span aria-hidden className="my-1.5 h-px w-6 shrink-0 bg-border" />
                ) : null}
                {renderItem(item)}
              </Fragment>
            );
          })}
        </div>
      </ScrollArea>
      <div className={cn("flex flex-col gap-0.5", !expanded && "items-center")}>
        {bottom.map(renderItem)}
        {/* Shows only while an update is on its way, directly under Settings. */}
        <SidebarMenu className={cn("empty:hidden", expanded ? "items-start" : "items-center")}>
          <SidebarUpdatePill className="ml-0" />
        </SidebarMenu>
      </div>
    </nav>
  );
}

function RailLink({
  item,
  current,
  lastThread,
  expanded,
  badge,
}: {
  readonly item: RailItem;
  readonly current: boolean;
  readonly lastThread: ReturnType<typeof useTwoStateStore.getState>["lastThread"];
  readonly expanded: boolean;
  readonly badge: number;
}) {
  const Icon = ICONS[item.id] ?? LayoutDashboardIcon;
  const label = railLinkLabel(item.label, badge);
  const common = {
    "aria-label": label,
    "aria-current": current ? ("page" as const) : undefined,
    className: cn(
      TARGET_CLASS,
      expanded && "h-9 w-full justify-start gap-3 px-2.5 hover:bg-accent",
      current && ACTIVE_CLASS,
    ),
  };
  const content: ReactNode = (
    <>
      <Icon aria-hidden className="size-5 shrink-0" />
      {expanded ? <span className="truncate text-sm">{item.label}</span> : null}
      {badge > 0 ? (
        <span
          aria-hidden
          className={cn(
            "min-w-4 rounded-full bg-warning px-1 text-center text-3xs leading-4 font-semibold text-background tabular-nums",
            expanded ? "ml-auto" : "absolute -top-1 -right-1",
          )}
        >
          {badgeText(badge)}
        </span>
      ) : null}
    </>
  );
  return (
    <Tip text={item.tooltip}>
      {item.id === "chat" && lastThread ? (
        <Link
          to="/$environmentId/$threadId"
          params={{ environmentId: lastThread.environmentId, threadId: lastThread.threadId }}
          {...common}
        >
          {content}
        </Link>
      ) : (
        <Link to={item.to} {...common}>
          {content}
        </Link>
      )}
    </Tip>
  );
}

/**
 * Expanded: the workspace picker with the collapse icon beside it. Collapsed: the workspace
 * picture, the expand icon under it, then a divider (Jake's "Option 1", 2026-11-07).
 */
function RailHeader({
  expanded,
  needsYou,
  onToggle,
}: {
  readonly expanded: boolean;
  readonly needsYou: number | null;
  readonly onToggle: (() => void) | null;
}) {
  const toggleLabel = expanded ? "Collapse the menu" : "Expand the menu";
  const toggle = onToggle ? (
    <Tip text={toggleLabel}>
      <button
        type="button"
        aria-label={toggleLabel}
        aria-expanded={expanded}
        onClick={onToggle}
        className={cn(CONTROL_CLASS, "size-9")}
      >
        {expanded ? (
          <PanelLeftCloseIcon aria-hidden className="size-5" />
        ) : (
          <PanelLeftOpenIcon aria-hidden className="size-5" />
        )}
      </button>
    </Tip>
  ) : null;
  if (expanded) {
    return (
      // The drawer has no toggle, and its close button sits at the top right: leave it room.
      <div className={cn("flex items-center gap-1", !toggle && "pr-8")}>
        <WorkspacePicker expanded needsYou={needsYou} />
        {toggle}
      </div>
    );
  }
  return (
    <>
      <WorkspacePicker expanded={false} needsYou={needsYou} />
      {toggle}
      <span aria-hidden className="my-1 h-px w-6 shrink-0 bg-border" />
    </>
  );
}

/** The workspace tile (and, expanded, its name and type). It opens the workspace menu. */
function WorkspacePicker({
  expanded,
  needsYou,
}: {
  readonly expanded: boolean;
  readonly needsYou: number | null;
}) {
  const { active } = useActiveAiosWorkspace();
  const { pictures } = useWorkspacePictures();
  const [open, setOpen] = useState(false);
  const name = active?.name ?? "Leonidas";
  const business = active?.type === "business";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tip text={`Workspace: ${name}`}>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label={`Workspace: ${name}. Switch workspace`}
              className={cn(
                CONTROL_CLASS,
                "text-foreground",
                expanded ? "min-w-0 flex-1 justify-start gap-2.5 px-1.5 py-1" : "size-9",
              )}
            />
          }
        >
          <WorkspacePicture
            workspaceId={active?.id}
            name={name}
            pictures={pictures}
            className="size-8 rounded-lg border border-border text-xs"
          />
          {expanded ? (
            <>
              <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                <span className="w-full truncate text-left text-sm font-semibold">{name}</span>
                <WorkspaceTypeChip business={business} />
              </span>
              <ChevronsUpDownIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            </>
          ) : null}
        </PopoverTrigger>
      </Tip>
      <PopoverPopup side={expanded ? "bottom" : "right"} align="start" className="w-80">
        <WorkspaceMenu needsYou={needsYou} onDone={() => setOpen(false)} />
      </PopoverPopup>
    </Popover>
  );
}
