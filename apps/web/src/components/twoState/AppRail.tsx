import type { ContextMenuItem } from "@t3tools/contracts";
import { Link, useLocation, useParams } from "@tanstack/react-router";
import {
  AudioLinesIcon,
  BellIcon,
  BotIcon,
  BrainIcon,
  ChevronsUpDownIcon,
  ClapperboardIcon,
  FolderKanbanIcon,
  GaugeIcon,
  ImageIcon,
  LandmarkIcon,
  LayoutDashboardIcon,
  LibraryIcon,
  ListChecksIcon,
  MegaphoneIcon,
  MessageSquareIcon,
  MicIcon,
  NotebookPenIcon,
  PaperclipIcon,
  SettingsIcon,
  ShieldAlertIcon,
  SunIcon,
  TerminalSquareIcon,
  UsersIcon,
  WalletIcon,
  ZapIcon,
  type LucideIcon,
} from "lucide-react";
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import { APP_VERSION_LABEL } from "~/branding";
import { openReleaseHistoryDialog } from "~/components/desktop/ReleaseHistoryDialog";
import { SidebarUpdatePill } from "~/components/sidebar/SidebarUpdatePill";
import { FinishSetupRow } from "./FinishSetupRow";
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
import { cn, isMacPlatform } from "~/lib/utils";
import { readLocalApi } from "~/localApi";
import { resolveThreadRouteTarget } from "~/threadRoutes";

import {
  activeRailId,
  badgeAnnouncement,
  RAIL_GROUP_LABELS,
  railLinkLabel,
  type RailItem,
} from "./railItems";
import { Tip } from "./Tip";
import { useRailItems } from "./useRailItems";
import { useTwoStateStore } from "./twoStateStore";
import { useTwoStateCounts } from "./useTwoStateData";

export const ICONS: Readonly<Record<string, LucideIcon>> = {
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
  usage: GaugeIcon,
  settings: SettingsIcon,
  "trading-dashboard": LayoutDashboardIcon,
  "trading-journal": NotebookPenIcon,
  "trading-accounts": LandmarkIcon,
  "trading-risk": ShieldAlertIcon,
  "trading-money": WalletIcon,
  "trading-crew": UsersIcon,
};

const TARGET_CLASS =
  "relative inline-flex size-9 shrink-0 touch-hit items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none [-webkit-app-region:no-drag]";
// The current page takes the action color on a faint tint (DESIGN.md "Rail").
const ACTIVE_CLASS = "border-transparent bg-primary/14 text-primary hover:text-primary";
const CONTROL_CLASS =
  "inline-flex shrink-0 touch-hit items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none [-webkit-app-region:no-drag]";

/** "99+" past 99, so the badge stays small. */
export const badgeText = (count: number) => (count > 99 ? "99+" : String(count));

/** How a rail tab draws: a row with its name beside the icon, the name under the icon, or the icon alone. */
type RailVariant = "wide" | "stacked" | "icon";

/**
 * The only app navigation, in flat groups with thin dividers between them. It has one state: each
 * icon with its name under it (Jake's sidebar pick, 2026-11-17; no collapse, 2026-11-18). The
 * workspace picker sits on top. Usage and Settings at the bottom show their icons alone.
 * `drawer` is the narrow-window sheet: names beside icons with group names.
 * Chat opens the last chat, else the chat start page.
 */
export function AppRail({ drawer = false }: { readonly drawer?: boolean }) {
  const variant: RailVariant = drawer ? "wide" : "stacked";
  const wide = drawer;
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
  const { main, bottom, pinned, pinnable, togglePin } = useRailItems();
  const current = activeRailId(pathname, onChat);
  // Right-click pins a tab to the chat panel. The drawer has no chat panel, so it has no pin menu.
  const pinFor = (item: RailItem): RailPin | null =>
    wide || !pinnable.some((entry) => entry.id === item.id)
      ? null
      : {
          on: pinned.some((entry) => entry.id === item.id),
          toggle: (on) => togglePin(item.id, on),
        };
  const renderItem = (item: RailItem, as: RailVariant = variant) => (
    <RailLink
      key={item.id}
      item={item}
      current={item.id === current}
      lastThread={lastThread}
      variant={as}
      badge={item.id === "inbox" ? (unread ?? 0) : 0}
      pin={pinFor(item)}
    />
  );
  const versionButton = (
    <Tip text="Version of Leonidas. Select to see what changed in each update.">
      <button
        type="button"
        onClick={openReleaseHistoryDialog}
        className={cn(
          "shrink-0 rounded-lg text-muted-foreground tabular-nums outline-hidden ring-ring transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset [-webkit-app-region:no-drag]",
          "h-7 px-2.5 text-left text-xs",
        )}
      >
        v{APP_VERSION_LABEL} · what changed
      </button>
    </Tip>
  );
  return (
    <nav
      aria-label="Main"
      className={cn(
        "flex h-full shrink-0 flex-col gap-1 border-r border-border bg-card pb-2",
        // Empty rail space moves the window, as a title bar does. Its links and buttons stay clickable.
        isElectron && "drag-region",
        wide ? "w-full px-2" : "w-[72px] items-center px-1",
        isElectron && isMacPlatform(navigator.platform) ? "pt-10" : "pt-2",
      )}
    >
      <RailHeader wide={wide} needsYou={unread} />
      {wide ? versionButton : null}
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
      <FinishSetupRow compact={!wide} />

      {/* The fade shows only on the edge that has more rows. Rows are links, so the list needs no tab stop. */}
      <ScrollArea
        scrollFade
        // The fade is the cue for more rows. A scrollbar thumb here showed as a stray gray bar above Usage.
        hideScrollbars
        viewportTabIndex={-1}
        // A row is 38 px high: the fade must reach into the next row, or the cue is invisible.
        className="mt-1 w-full flex-1 [&_[data-slot=scroll-area-viewport]]:overflow-x-hidden [&_[data-slot=scroll-area-viewport]]:[--fade-size:3rem]"
      >
        <div
          className={cn(
            "flex flex-col",
            variant === "stacked" ? "gap-0" : "gap-0.5",
            !wide && "items-center",
          )}
        >
          {main.map((item, index) => {
            const first = index === 0 || main[index - 1]!.group !== item.group;
            return (
              <Fragment key={item.id}>
                {first && wide ? (
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
                {first && !wide && index > 0 ? (
                  <span aria-hidden className="my-1 h-px w-6 shrink-0 bg-border" />
                ) : null}
                {renderItem(item)}
              </Fragment>
            );
          })}
        </div>
      </ScrollArea>
      <div className={cn("flex flex-col gap-0.5", !wide && "items-center")}>
        {/* Usage and Settings show the icon alone (names stay in the tooltip and the aria-label). */}
        {bottom.map((item) => renderItem(item, wide ? "wide" : "icon"))}
        {/* Shows only while an update is on its way, directly under Settings. */}
        <SidebarMenu className={cn("empty:hidden", wide ? "items-start" : "items-center")}>
          <SidebarUpdatePill className="ml-0" expanded={wide} />
        </SidebarMenu>
      </div>
    </nav>
  );
}

interface RailPin {
  readonly on: boolean;
  readonly toggle: (on: boolean) => void;
}

/** Right-click a rail tab: pin it to the chat panel, or unpin it. The tab stays on the rail either way. */
function showPinMenu(event: ReactMouseEvent, pin: RailPin) {
  const api = readLocalApi();
  if (!api) return;
  event.preventDefault();
  const items: ContextMenuItem<"toggle-pin">[] = [
    { id: "toggle-pin", label: pin.on ? "Unpin from the chat panel" : "Pin to the chat panel" },
  ];
  void api.contextMenu.show(items, { x: event.clientX, y: event.clientY }).then((action) => {
    if (action === "toggle-pin") pin.toggle(!pin.on);
  });
}

function RailLink({
  item,
  current,
  lastThread,
  variant,
  badge,
  pin,
}: {
  readonly item: RailItem;
  readonly current: boolean;
  readonly lastThread: ReturnType<typeof useTwoStateStore.getState>["lastThread"];
  readonly variant: RailVariant;
  readonly badge: number;
  readonly pin: RailPin | null;
}) {
  const Icon = ICONS[item.id] ?? LayoutDashboardIcon;
  const label = railLinkLabel(item.label, badge);
  const common = {
    "aria-label": label,
    "aria-current": current ? ("page" as const) : undefined,
    onContextMenu: pin ? (event: ReactMouseEvent) => showPinMenu(event, pin) : undefined,
    className: cn(
      TARGET_CLASS,
      variant === "wide" && "h-9 w-full justify-start gap-3 px-2.5 hover:bg-accent",
      variant === "stacked" && "h-10 w-16 flex-col gap-1 px-0.5 hover:bg-accent",
      current && ACTIVE_CLASS,
    ),
  };
  const content: ReactNode = (
    <>
      <Icon
        aria-hidden
        className={cn("shrink-0", variant === "stacked" ? "size-[18px]" : "size-5")}
      />
      {variant === "wide" ? <span className="truncate text-sm">{item.label}</span> : null}
      {variant === "stacked" ? (
        <span
          className={cn(
            "max-w-full truncate text-3xs leading-none",
            current ? "font-medium text-foreground" : "text-muted-foreground",
          )}
        >
          {item.short ?? item.label}
        </span>
      ) : null}
      {badge > 0 ? (
        <span
          aria-hidden
          className={cn(
            "min-w-4 rounded-full bg-warning px-1 text-center text-3xs leading-4 font-semibold text-background tabular-nums",
            variant === "wide"
              ? "ml-auto"
              : variant === "stacked"
                ? "absolute top-0.5 right-2.5"
                : "absolute -top-1 -right-1",
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
 * The workspace picker is the top of the rail (Jake, 2026-11-18). Wide (drawer): the picture, name
 * and type. Stacked: the picture alone, then a divider.
 */
function RailHeader({
  wide,
  needsYou,
}: {
  readonly wide: boolean;
  readonly needsYou: number | null;
}) {
  if (wide) {
    return (
      // The drawer's close button sits at the top right: leave it room.
      <div className="flex items-center gap-1 pr-8">
        <WorkspacePicker expanded needsYou={needsYou} />
      </div>
    );
  }
  return (
    <>
      <WorkspacePicker expanded={false} needsYou={needsYou} />
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
                <WorkspaceTypeChip type={active?.type ?? "personal"} />
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
