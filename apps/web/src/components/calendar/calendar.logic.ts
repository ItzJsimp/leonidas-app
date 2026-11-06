import type { CalendarEvent } from "@t3tools/contracts";

export const CALENDAR_SETUP_DOC =
  "https://github.com/ItzJsimp/leonidas-app/blob/main/docs/user/calendar.md";

/** Same set as the server picks from. A custom value is still accepted. */
export const CALENDAR_COLORS = [
  { value: "#4f8cff", name: "Blue" },
  { value: "#34a853", name: "Green" },
  { value: "#e8710a", name: "Orange" },
  { value: "#d93025", name: "Red" },
  { value: "#9334e6", name: "Purple" },
  { value: "#00897b", name: "Teal" },
  { value: "#c2185b", name: "Pink" },
  { value: "#5f6368", name: "Gray" },
] as const;

export interface LinkGuide {
  readonly id: "google" | "outlook" | "apple" | "other";
  readonly label: string;
  readonly steps: readonly string[];
  /** One line under the steps, when the app has a trap to avoid. */
  readonly note?: string;
}

/** Checked against the vendor help pages in October 2026. */
export const LINK_GUIDES: readonly LinkGuide[] = [
  {
    id: "google",
    label: "Google Calendar",
    steps: [
      "Open Google Calendar on a computer.",
      "Point at the calendar in the left list. Click the three dots, then Settings and sharing.",
      "Scroll down to Integrate calendar.",
      "Copy the Secret address in iCal format.",
    ],
    note: "Keep this link private. Do not copy the Public address.",
  },
  {
    id: "outlook",
    label: "Outlook",
    steps: [
      "Open Outlook on the web. Click Settings, then Calendar, then Shared calendars.",
      "Under Publish a calendar, pick the calendar and choose Can view all details.",
      "Click Publish.",
      "Copy the ICS link, not the HTML link.",
    ],
  },
  {
    id: "apple",
    label: "Apple iCloud",
    steps: [
      "Open the Calendar app on your Mac, or icloud.com/calendar.",
      "Share the calendar: right-click it on a Mac, or click the share icon on icloud.com.",
      "Turn on Public Calendar.",
      "Click Copy Link.",
    ],
    note: "Anyone who has this link can see the calendar.",
  },
  {
    id: "other",
    label: "Other",
    steps: [
      "Open the settings of your calendar app or site.",
      "Look for iCal, ICS, Subscribe or Publish.",
      "Copy the link. It ends in .ics or starts with webcal://.",
    ],
  },
];

const DAY_MS = 86_400_000;

/** Local midnight at or before `now`. */
export function startOfDay(now: number): number {
  const date = new Date(now);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Local midnight `days` days after the one at or before `now`. Uses the calendar, so DST days are right. */
export function addDays(now: number, days: number): number {
  const date = new Date(now);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).getTime();
}

const startMs = (event: CalendarEvent) => Date.parse(event.start);
const endMs = (event: CalendarEvent) => Date.parse(event.end);

/** Events that are on today, in time order. All-day events come first. */
export function eventsOnDay(events: readonly CalendarEvent[], now: number): CalendarEvent[] {
  const from = startOfDay(now);
  const to = addDays(now, 1);
  return events
    .filter((e) => startMs(e) < to && (endMs(e) > from || startMs(e) >= from))
    .toSorted(
      (a, b) =>
        Number(b.allDay) - Number(a.allDay) ||
        startMs(a) - startMs(b) ||
        a.title.localeCompare(b.title),
    );
}

/** The next `limit` events that have not ended. */
export function upcomingEvents(
  events: readonly CalendarEvent[],
  now: number,
  limit: number,
): CalendarEvent[] {
  return events
    .filter((e) => endMs(e) > now || startMs(e) >= now)
    .toSorted((a, b) => startMs(a) - startMs(b))
    .slice(0, limit);
}

const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short" });

export function timeLabel(event: CalendarEvent): string {
  return event.allDay ? "All day" : TIME.format(startMs(event));
}

/** "Today", "Tomorrow", or the weekday. */
export function dayLabel(event: CalendarEvent, now: number): string {
  const start = Math.max(startMs(event), startOfDay(now));
  if (start < addDays(now, 1)) return "Today";
  if (start < addDays(now, 2)) return "Tomorrow";
  return WEEKDAY.format(start);
}

export function timeRangeLabel(event: CalendarEvent): string {
  if (event.allDay) return "All day";
  const start = startMs(event);
  const end = endMs(event);
  return end > start ? `${TIME.format(start)} to ${TIME.format(end)}` : TIME.format(start);
}

export function formatSynced(iso: string | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) && ms > DAY_MS ? `Synced ${TIME.format(ms)}` : null;
}

/** The "count" on the Up next card: events today, or nothing. */
export function todayCountLabel(events: readonly CalendarEvent[], now: number): string | undefined {
  const count = eventsOnDay(events, now).length;
  return count === 0 ? undefined : count === 1 ? "1 today" : `${count} today`;
}
