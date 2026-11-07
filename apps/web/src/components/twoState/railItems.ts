export type RailTo =
  | "/command-center"
  | "/"
  | "/scribe"
  | "/meetings"
  | "/inbox"
  | "/today"
  | "/tasks"
  | "/projects"
  | "/memory"
  | "/library"
  | "/marketing"
  | "/content"
  | "/images"
  | "/files"
  | "/subagents"
  | "/team"
  | "/developer"
  | "/usage"
  | "/settings";

export interface RailItem {
  readonly id: string;
  readonly label: string;
  /** The name, a colon, and one plain line of what the icon opens. */
  readonly tooltip: string;
  readonly to: RailTo;
  /** Other pages that belong to this icon; each matches itself and the pages under it. */
  readonly alsoActiveOn?: readonly string[];
}

const item = (
  id: string,
  label: string,
  to: RailTo,
  line: string,
  alsoActiveOn?: readonly string[],
): RailItem => ({
  id,
  label,
  to,
  tooltip: `${label}: ${line}`,
  ...(alsoActiveOn ? { alsoActiveOn } : {}),
});

const under = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

const BEFORE_EXTRAS: readonly RailItem[] = [
  item("command-center", "Command Center", "/command-center", "your work and what needs you"),
  {
    ...item("chat", "Leonidas Chat", "/", "talk with Leonidas"),
    tooltip: "Leonidas Chat: talk with Leonidas and run agents",
  },
  item("scribe", "Scribe", "/scribe", "talk and have it typed for you"),
  item("meetings", "Meetings", "/meetings", "record, read and share your calls"),
  item("inbox", "Notifications", "/inbox", "what needs you and what finished"),
  item("today", "Today", "/today", "your priorities, schedule and briefing"),
  item("tasks", "Tasks", "/tasks", "what to do and what is in progress"),
  item("projects", "Projects", "/projects", "the projects you work on"),
  item("memory", "Memory", "/memory", "what Leonidas knows and remembers", ["/brain"]),
  item("library", "Library", "/library", "skills, helpers, reply styles and rules"),
  item("content", "Marketing", "/marketing", "posts and campaigns"),
  item("deals", "Content", "/content", "deals, scripts and what to film"),
  item("images", "Images", "/images", "make and keep pictures"),
  item("files", "Files", "/files", "every attachment, screenshot and upload"),
  item("subagents", "Subagents", "/subagents", "helpers your chats run, live and past"),
];
const TEAM = item("team", "Team", "/team", "members, roles and areas");
const DEVELOPER = item("developer", "Developer", "/developer", "Git, pull requests and terminals", [
  "/git",
  "/pull-requests",
]);
const BOTTOM: readonly RailItem[] = [
  item("usage", "Usage", "/usage", "how much of your plan you have used"),
  item("settings", "Settings", "/settings", "change how Leonidas works", ["/system-care"]),
];

/** The rail icons. Team shows for a business workspace and Developer for a builder. */
export function railItems(input: {
  readonly business: boolean;
  readonly builder: boolean;
  /** The Scribe engine runs on Windows only. The server host decides, not this browser. */
  readonly scribe: boolean;
}) {
  return {
    main: [
      ...BEFORE_EXTRAS.filter(
        (entry) => input.scribe || (entry.id !== "scribe" && entry.id !== "meetings"),
      ),
      ...(input.business ? [TEAM] : []),
      ...(input.builder ? [DEVELOPER] : []),
    ],
    bottom: BOTTOM,
  };
}

/** The icon that shows as the current page. Every chat page belongs to the Chat icon. */
export function activeRailId(pathname: string, onChat: boolean): string | null {
  if (onChat || pathname === "/") return "chat";
  const all = railItems({ business: true, builder: true, scribe: true });
  const match = [...all.main, ...all.bottom].find(
    (entry) =>
      (entry.to !== "/" && under(pathname, entry.to)) ||
      entry.alsoActiveOn?.some((base) => under(pathname, base)) === true,
  );
  return match?.id ?? null;
}

/** What the polite live region says when the Inbox count changes. Empty on the first load. */
export function badgeAnnouncement(previous: number | null, next: number | null): string {
  if (previous === null || next === null || previous === next) return "";
  if (next === 0) return "Nothing needs you";
  return `${next} ${next === 1 ? "needs" : "need"} you`;
}

/** A rail link's name: the page, plus how many need you when its badge shows. */
export function railLinkLabel(label: string, badge: number): string {
  if (badge <= 0) return label;
  return `${label}, ${badge} ${badge === 1 ? "needs" : "need"} you`;
}
