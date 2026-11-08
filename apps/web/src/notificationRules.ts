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
    tip: "Pops up while Leonidas is open, and stays in Notifications.",
  },
  { id: "inbox", label: "Inbox only", tip: "Goes to Notifications without a pop-up or a sound." },
  {
    id: "off",
    label: "Off",
    tip: "Hidden everywhere: no pop-up, no badge, not in Notifications.",
  },
];

type RuleEvent = Pick<FeedEvent, "type" | "level" | "actor">;

const APP_FINISHED = new Set(["agent.finished", "agent.child_finished"]);

/** Questions and failures pop up. Info stays in Notifications, except chats the app saw finish. */
export function defaultRule(event: RuleEvent): NotificationRule {
  if (event.level !== "info") return "toast";
  return event.actor.kind === "app" && APP_FINISHED.has(event.type) ? "toast" : "inbox";
}

export const ruleFor = (event: RuleEvent, rules: NotificationRules): NotificationRule =>
  rules[event.type] ?? defaultRule(event);

/** True when the event may show a toast, a Windows notification or play a sound. */
export const popsUp = (event: RuleEvent, rules: NotificationRules): boolean =>
  ruleFor(event, rules) === "toast";

/** False for a type the user turned off: it leaves the list, the badge and every count. */
export const isShown = (event: RuleEvent, rules: NotificationRules): boolean =>
  ruleFor(event, rules) !== "off";

/** The types the app writes itself, so they can be set before the first one arrives. */
const APP_TYPES: ReadonlyArray<RuleEvent> = [
  { type: "agent.needs_input", level: "needs_you", actor: { kind: "app", name: "Leonidas" } },
  { type: "agent.needs_permission", level: "needs_you", actor: { kind: "app", name: "Leonidas" } },
  { type: "agent.usage_limit", level: "needs_you", actor: { kind: "app", name: "Leonidas" } },
  { type: "agent.failed", level: "failed", actor: { kind: "app", name: "Leonidas" } },
  { type: "agent.finished", level: "info", actor: { kind: "app", name: "Leonidas" } },
  { type: "agent.child_finished", level: "info", actor: { kind: "app", name: "Leonidas" } },
];

const TYPE_LABELS: Readonly<Record<string, string>> = {
  "agent.needs_input": "Chat needs your answer",
  "agent.needs_permission": "Chat needs permission",
  "agent.usage_limit": "Usage limit reached",
  "agent.failed": "Chat failed",
  "agent.finished": "Chat finished",
  "agent.child_finished": "Delegated task finished",
  "task.worked": "Task worked on",
  "aios.changed": "AIOS changed",
};

/** "watchdog.failed" reads "Watchdog failed". Known app types have their own words. */
export function typeLabel(type: string): string {
  const known = TYPE_LABELS[type];
  if (known) return known;
  const words = type
    .replace(/[._-]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface RuleRow {
  readonly type: string;
  readonly label: string;
  /** Events of this type in the feed, folded repeats included. */
  readonly count: number;
  /** The newest event's time, or null for an app type that has not happened yet. */
  readonly lastAt: number | null;
  readonly rule: NotificationRule;
  /** True when the user has not chosen a rule, so the default applies. */
  readonly isDefault: boolean;
}

export interface RuleGroup {
  readonly source: string;
  readonly rows: ReadonlyArray<RuleRow>;
}

/** One row per event type, grouped by the source that writes it. Busiest source and type first. */
export function ruleGroups(
  events: ReadonlyArray<FoldedFeedEvent>,
  rules: NotificationRules,
): ReadonlyArray<RuleGroup> {
  const byType = new Map<
    string,
    { sample: RuleEvent; source: string; count: number; lastAt: number | null }
  >();
  for (const event of events) {
    const at = Date.parse(event.ts);
    const entry = byType.get(event.type);
    if (!entry) {
      byType.set(event.type, {
        sample: event,
        source: event.actor.name,
        count: event.count,
        lastAt: Number.isFinite(at) ? at : null,
      });
      continue;
    }
    entry.count += event.count;
    if (Number.isFinite(at) && (entry.lastAt === null || at > entry.lastAt)) {
      entry.lastAt = at;
      entry.source = event.actor.name;
    }
  }
  for (const sample of APP_TYPES) {
    if (!byType.has(sample.type)) {
      byType.set(sample.type, { sample, source: sample.actor.name, count: 0, lastAt: null });
    }
  }
  const groups = new Map<string, RuleRow[]>();
  for (const [type, entry] of byType) {
    const row: RuleRow = {
      type,
      label: typeLabel(type),
      count: entry.count,
      lastAt: entry.lastAt,
      rule: ruleFor(entry.sample, rules),
      isDefault: rules[type] === undefined,
    };
    groups.set(entry.source, [...(groups.get(entry.source) ?? []), row]);
  }
  const total = (rows: ReadonlyArray<RuleRow>) => rows.reduce((sum, row) => sum + row.count, 0);
  return [...groups]
    .map(([source, rows]) => ({
      source,
      rows: rows.toSorted((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    }))
    .toSorted((a, b) => total(b.rows) - total(a.rows) || a.source.localeCompare(b.source));
}
