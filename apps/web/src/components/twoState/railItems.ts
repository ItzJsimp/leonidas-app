export type RailTo =
  | "/trading/dashboard"
  | "/trading/journal"
  | "/trading/accounts"
  | "/trading/risk"
  | "/trading/money"
  | "/trading/crew"
  | "/trading/library"
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
  | "/automations"
  | "/subagents"
  | "/team"
  | "/developer"
  | "/usage"
  | "/settings";

/** The flat rail groups, in order (DESIGN.md "Rail groups"). */
export type RailGroup =
  | "home"
  | "work"
  | "brain"
  | "create"
  | "business"
  | "builder"
  | "trade"
  | "learn"
  | "crew";

export const RAIL_GROUP_LABELS: Readonly<Record<RailGroup, string>> = {
  home: "Home",
  work: "Work",
  brain: "Brain",
  create: "Create",
  business: "Business",
  builder: "Builder",
  trade: "Trade",
  learn: "Learn",
  crew: "Crew",
};

export interface RailItem {
  readonly id: string;
  readonly group: RailGroup;
  readonly label: string;
  /** The name, a colon, and one plain line of what the icon opens. */
  readonly tooltip: string;
  readonly to: RailTo;
  /** Other pages that belong to this icon; each matches itself and the pages under it. */
  readonly alsoActiveOn?: readonly string[];
}

const item = (
  group: RailGroup,
  id: string,
  label: string,
  to: RailTo,
  line: string,
  alsoActiveOn?: readonly string[],
): RailItem => ({
  group,
  id,
  label,
  to,
  tooltip: `${label}: ${line}`,
  ...(alsoActiveOn ? { alsoActiveOn } : {}),
});

const under = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

/** Business tabs (Marketing, Content, Team) show for a business workspace or one switch each. */
const MAIN: readonly RailItem[] = [
  item(
    "home",
    "command-center",
    "Command Center",
    "/command-center",
    "your work and what needs you",
  ),
  item("home", "today", "Today", "/today", "your priorities, schedule and briefing"),
  item("home", "inbox", "Notifications", "/inbox", "what needs you and what finished"),
  {
    ...item("work", "chat", "Leonidas Chat", "/", "talk with Leonidas"),
    tooltip: "Leonidas Chat: talk with Leonidas and run agents",
  },
  item("work", "tasks", "Tasks", "/tasks", "what to do and what is in progress"),
  item("work", "projects", "Projects", "/projects", "the projects you work on"),
  item("brain", "memory", "Memory", "/memory", "what Leonidas knows and remembers", ["/brain"]),
  item("brain", "library", "Library", "/library", "skills, reply styles and rules"),
  item("brain", "subagents", "Agents", "/subagents", "your agent team, what it ran and starters"),
  item("brain", "automations", "Automations", "/automations", "everything that runs by itself", [
    "/system-care",
  ]),
  item("create", "scribe", "Scribe", "/scribe", "talk and have it typed for you"),
  item("create", "meetings", "Meetings", "/meetings", "record, read and share your calls"),
  item("create", "images", "Images", "/images", "make and keep pictures"),
  item("create", "files", "Files", "/files", "every attachment, screenshot and upload"),
  item("business", "content", "Marketing", "/marketing", "posts and campaigns"),
  item("business", "deals", "Content", "/content", "deals, scripts and what to film"),
  item("business", "team", "Team", "/team", "members, roles and areas"),
  item("builder", "developer", "Developer", "/developer", "Git, pull requests and terminals", [
    "/git",
    "/pull-requests",
  ]),
];
const BOTTOM: readonly RailItem[] = [
  item("home", "usage", "Usage", "/usage", "how much of your plan you have used"),
  item("home", "settings", "Settings", "/settings", "change how Leonidas works"),
];

const TRADING_ONLY: readonly RailItem[] = [
  item("trade", "trading-dashboard", "Dashboard", "/trading/dashboard", "your trading at a glance"),
  item("trade", "trading-journal", "Journal", "/trading/journal", "log and review your trades"),
  item(
    "trade",
    "trading-accounts",
    "Accounts",
    "/trading/accounts",
    "your Evaluations and Funded accounts",
  ),
  item("trade", "trading-risk", "Risk", "/trading/risk", "how much you can lose today"),
  item("trade", "trading-money", "Money", "/trading/money", "Firm fees, Payouts and Total cost"),
  item("crew", "trading-crew", "Crew", "/trading/crew", "your Crew board"),
];
/** The Trading Library: the course, pages and cards of the linked pack, and saved resources. */
const TRADING_LIBRARY = item(
  "learn",
  "trading-library",
  "Library",
  "/trading/library",
  "your course, firm pages, cards and saved resources",
);
const regroup = (id: string, group: RailGroup): RailItem => ({
  ...MAIN.find((entry) => entry.id === id)!,
  group,
});
/** A Trading workspace shows its own tabs and none of the personal ones. */
const TRADING: readonly RailItem[] = [
  ...TRADING_ONLY.slice(0, 5),
  TRADING_LIBRARY,
  regroup("chat", "learn"),
  ...TRADING_ONLY.slice(5),
];

/** The rail icons, grouped in order. Marketing, Content and Team show for a business workspace and Developer for a builder. */
export function railItems(input: {
  readonly business: boolean;
  readonly builder: boolean;
  /** Business tab ids this person chose to show in a personal workspace. */
  readonly showAnyway?: readonly string[];
  /** The Scribe engine runs on Windows only. The server host decides, not this browser. */
  readonly scribe: boolean;
  /** A Trading workspace: its own rail replaces the personal one. */
  readonly trading?: boolean;
}) {
  if (input.trading) return { main: TRADING, bottom: BOTTOM };
  const shows = (id: string) => input.business || input.showAnyway?.includes(id) === true;
  return {
    main: MAIN.filter(
      (entry) =>
        (input.scribe || (entry.id !== "scribe" && entry.id !== "meetings")) &&
        (entry.group !== "business" || shows(entry.id)) &&
        (entry.group !== "builder" || input.builder),
    ),
    bottom: BOTTOM,
  };
}

/** The icon that shows as the current page. Every chat page belongs to the Chat icon. */
export function activeRailId(pathname: string, onChat: boolean): string | null {
  if (onChat || pathname === "/") return "chat";
  const all = railItems({ business: true, builder: true, scribe: true });
  const match = [...TRADING_ONLY, TRADING_LIBRARY, ...all.main, ...all.bottom].find(
    (entry) =>
      (entry.to !== "/" && under(pathname, entry.to)) ||
      entry.alsoActiveOn?.some((base) => under(pathname, base)) === true,
  );
  return match?.id ?? null;
}

/** What the polite live region says when the Inbox count changes. Empty on the first load. */
export function badgeAnnouncement(previous: number | null, next: number | null): string {
  if (previous === null || next === null || previous === next) return "";
  return needsYouLine(next);
}

/** "Nothing needs you" or "N need you", in correct grammar. */
export function needsYouLine(count: number): string {
  if (count <= 0) return "Nothing needs you";
  return `${count} ${count === 1 ? "needs" : "need"} you`;
}

/** A rail link's name: the page, plus how many need you when its badge shows. */
export function railLinkLabel(label: string, badge: number): string {
  if (badge <= 0) return label;
  return `${label}, ${badge} ${badge === 1 ? "needs" : "need"} you`;
}
