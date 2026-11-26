import type { FeedEvent, FoldedFeedEvent } from "@t3tools/contracts";

/** What one event type does: pop up as a toast, stay in Notifications only, or stay out of sight. */
export type NotificationRule = "toast" | "inbox" | "off";
export type NotificationRules = Readonly<Record<string, NotificationRule>>;

export const NOTIFICATION_RULES: ReadonlyArray<{
  readonly id: NotificationRule;
  readonly label: string;
  readonly tip: string;
}> = [
  {
    id: "toast",
    label: "Toast",
    tip: "Shows a pop-up in Leonidas, a system alert when hidden, optional sound, and saves to Inbox.",
  },
  {
    id: "inbox",
    label: "Inbox only",
    tip: "Saves quietly in Notifications with no pop-up and no sound.",
  },
  {
    id: "off",
    label: "Off",
    tip: "Hidden everywhere: no pop-up, no sound, no badge count, and not in Notifications.",
  },
];

type RuleEvent = Pick<FeedEvent, "type" | "level" | "actor">;

/** Event types that are retired and permanently disabled across Inbox, badges, and Rules. */
const RETIRED_TYPES = new Set<string>(["agent.needs_input"]);

export const isRetiredNotificationType = (type: string): boolean => RETIRED_TYPES.has(type);

/**
 * Questions and failures pop up. Info stays in Notifications, except a long chat that finished.
 * Task work logs and delegated sub-agent completions stay quiet in Inbox.
 */
export function defaultRule(event: RuleEvent): NotificationRule {
  if (RETIRED_TYPES.has(event.type)) return "off";
  if (event.type === "task.worked") return "inbox";
  if (event.level !== "info") return "toast";
  return event.actor.kind === "app" && event.type === "agent.finished" ? "toast" : "inbox";
}

export const ruleFor = (event: RuleEvent, rules: NotificationRules): NotificationRule => {
  if (RETIRED_TYPES.has(event.type)) return "off";
  return rules[event.type] ?? defaultRule(event);
};

/** True when the event may show a toast, a Windows notification or play a sound. */
export const popsUp = (event: RuleEvent, rules: NotificationRules): boolean =>
  ruleFor(event, rules) === "toast";

/** False for a type the user turned off (or a retired type): it leaves the list, badge and counts. */
export const isShown = (event: RuleEvent, rules: NotificationRules): boolean =>
  ruleFor(event, rules) !== "off";

type TypeEntry = readonly [label: string, description: string];

const CHATS = "Leonidas chats";
const WATCHERS = "Watchers";

const TYPE_CATALOG: Readonly<Record<string, TypeEntry>> = {
  "agent.needs_input": ["Chat needs your answer", "Retired follow-up prompt alert."],
  "agent.needs_permission": ["Chat needs permission", "Chat paused to ask permission."],
  "agent.usage_limit": ["Usage limit reached", "AI account hit its usage cap."],
  "agent.failed": ["Chat failed", "Chat stopped with an error before finishing."],
  "agent.finished": ["Chat finished", "Long chat (2+ min) finished while away."],
  "agent.child_finished": ["Delegated task finished", "Background sub-agent finished."],
  "watcher.repo-health": ["Repo health", "Hourly check for stale worktrees and Git locks."],
  "watcher.release-health": ["Release health", "6-hour release build and boot smoke test check."],
  "watcher.canon-drift": ["Skill and canon drift", "Daily check for stale links and skills."],
  "watcher.frontier-digest": ["Frontier digest", "Weekly check for new skill ideas."],
  "watcher.upstream-digest": ["Upstream digest", "Weekly list of new upstream commits."],
  "task.worked": ["Task work log", "Agent work summary logged on a task card."],
  "aios.changed": ["Workspace file changed", "Updates to workspace memory or settings."],
  "tasks.needs_you": ["Task needs attention", "A task card is waiting on your review."],
  "update.needs_you": ["App update available", "A Leonidas update needs your attention."],
  "system.needs_you": ["System check alert", "A system check found an issue to review."],
  "memory.needs_you": ["Memory check alert", "A memory check flagged something to review."],
  "finance.needs_you": ["Finance alert", "A finance check reported an item to review."],
  "planning.info": ["Planning update", "Daily or weekly scheduled planning notes."],
  "scribe.info": ["Scribe status", "Status updates from Scribe voice dictation."],
  "cache.info": ["Cache maintenance", "Routine cache cleanup or rebuild results."],
  "health.info": ["System health check", "Routine background health check status."],
  "health.weekly": ["Weekly health report", "Weekly automated system health summary."],
  "model_registry.discovered.info": ["New AI models found", "New models found in providers."],
  "watchdog.failed": ["Watchdog failed", "A background watchdog exited with an error."],
  "watchdog.info": ["Watchdog update", "Status note from a background watchdog."],
  "automation.failed": ["Automation failed", "A scheduled automation failed to finish."],
  "automation.info": ["Automation update", "A scheduled automation logged a note."],
  "script.failed": ["Script failed", "A local script reported an error."],
  "script.info": ["Script update", "A local script logged a status message."],
};

const SEEDED_TYPES: ReadonlyArray<RuleEvent> = (
  [
    ["agent.needs_permission", "needs_you", "app", "Leonidas"],
    ["agent.usage_limit", "needs_you", "app", "Leonidas"],
    ["agent.failed", "failed", "app", "Leonidas"],
    ["agent.finished", "info", "app", "Leonidas"],
    ["agent.child_finished", "info", "app", "Leonidas"],
    ["watcher.repo-health", "needs_you", "script", "Repo health"],
    ["watcher.release-health", "needs_you", "script", "Release health"],
    ["watcher.canon-drift", "needs_you", "script", "Skill and canon drift"],
    ["watcher.frontier-digest", "info", "script", "Frontier digest"],
    ["watcher.upstream-digest", "info", "script", "Upstream digest"],
  ] as const
).map(([type, level, kind, name]) => ({ type, level, actor: { kind, name } }));

/** "watchdog.failed" reads "Watchdog failed". Known types have plain names. */
export function typeLabel(type: string): string {
  const known = TYPE_CATALOG[type];
  if (known) return known[0];
  const cleaned = type.startsWith("watcher.") ? type.slice("watcher.".length) : type;
  const words = cleaned
    .replace(/[._-]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Plain one-sentence explanation of what triggers this notification type. */
export function typeDescription(type: string, source?: string): string {
  const known = TYPE_CATALOG[type];
  if (known) return known[1];
  if (type.startsWith("watcher.")) {
    return "Built-in background check that runs on a schedule.";
  }
  if (type.endsWith(".failed")) {
    return source
      ? `Error reported by ${source}.`
      : "Error reported by a background script or automation.";
  }
  if (type.endsWith(".needs_you")) {
    return source
      ? `Action alert from ${source}.`
      : "Action alert from a background check or script.";
  }
  return source
    ? `Status notification from ${source}.`
    : "Notification from a background script or tool.";
}

function groupFor(type: string, actorName: string): string {
  if (type.startsWith("watcher.")) return WATCHERS;
  if (type.startsWith("agent.")) return CHATS;
  return actorName;
}

const GROUP_DESCRIPTIONS: Readonly<Record<string, string>> = {
  [CHATS]: "Alerts from your active and background AI chats.",
  [WATCHERS]: "Built-in checks that run on a schedule in the background.",
};

export interface RuleRow {
  readonly type: string;
  readonly label: string;
  readonly description: string;
  /** Title of the newest matching event, used as a concrete example for custom scripts. */
  readonly latestTitle: string | null;
  /** Events of this type in the feed, folded repeats included. */
  readonly count: number;
  /** The newest event's time, or null for a built-in type that has not happened yet. */
  readonly lastAt: number | null;
  readonly rule: NotificationRule;
  readonly defaultRule: NotificationRule;
  /** True when the user has not chosen a rule, so the default applies. */
  readonly isDefault: boolean;
}

export interface RuleGroup {
  readonly source: string;
  readonly description?: string;
  readonly manageTo?: "/automations";
  readonly manageLabel?: string;
  readonly rows: ReadonlyArray<RuleRow>;
}

const GROUP_ORDER = new Map<string, number>([
  [CHATS, 0],
  [WATCHERS, 1],
]);

/** One row per event type, grouped clearly with built-in chats and watchers first. */
export function ruleGroups(
  events: ReadonlyArray<FoldedFeedEvent>,
  rules: NotificationRules,
): ReadonlyArray<RuleGroup> {
  const byType = new Map<
    string,
    {
      sample: RuleEvent;
      source: string;
      latestTitle: string | null;
      count: number;
      lastAt: number | null;
    }
  >();
  for (const event of events) {
    if (RETIRED_TYPES.has(event.type)) continue;
    const at = Date.parse(event.ts);
    const entry = byType.get(event.type);
    const source = groupFor(event.type, event.actor.name);
    if (!entry) {
      byType.set(event.type, {
        sample: event,
        source,
        latestTitle: event.title,
        count: event.count,
        lastAt: Number.isFinite(at) ? at : null,
      });
      continue;
    }
    entry.count += event.count;
    if (Number.isFinite(at) && (entry.lastAt === null || at > entry.lastAt)) {
      entry.lastAt = at;
      entry.source = source;
      entry.latestTitle = event.title;
    }
  }
  for (const sample of SEEDED_TYPES) {
    if (!byType.has(sample.type)) {
      byType.set(sample.type, {
        sample,
        source: groupFor(sample.type, sample.actor.name),
        latestTitle: null,
        count: 0,
        lastAt: null,
      });
    }
  }
  const groups = new Map<string, RuleRow[]>();
  for (const [type, entry] of byType) {
    const fallbackRule = defaultRule(entry.sample);
    const row: RuleRow = {
      type,
      label: typeLabel(type),
      description: typeDescription(type, entry.sample.actor.name),
      latestTitle: entry.latestTitle,
      count: entry.count,
      lastAt: entry.lastAt,
      rule: ruleFor(entry.sample, rules),
      defaultRule: fallbackRule,
      isDefault: rules[type] === undefined,
    };
    groups.set(entry.source, [...(groups.get(entry.source) ?? []), row]);
  }
  const total = (rows: ReadonlyArray<RuleRow>) => rows.reduce((sum, row) => sum + row.count, 0);
  return [...groups]
    .map(([source, rows]) => ({
      source,
      ...(GROUP_DESCRIPTIONS[source] ? { description: GROUP_DESCRIPTIONS[source] } : {}),
      ...(source === WATCHERS
        ? { manageTo: "/automations" as const, manageLabel: "Manage schedules" }
        : {}),
      rows: rows.toSorted((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    }))
    .toSorted((a, b) => {
      const aRank = GROUP_ORDER.get(a.source);
      const bRank = GROUP_ORDER.get(b.source);
      if (aRank !== undefined && bRank !== undefined) return aRank - bRank;
      if (aRank !== undefined) return -1;
      if (bRank !== undefined) return 1;
      return total(b.rows) - total(a.rows) || a.source.localeCompare(b.source);
    });
}
