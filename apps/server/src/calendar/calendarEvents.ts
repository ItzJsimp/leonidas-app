import type { CalendarEvent } from "@t3tools/contracts";

export const MAX_RANGE_DAYS = 92;

/** `YYYY-MM-DD HH:mm` on the wall clock of `timeZone`. */
const wall = (iso: string, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(Date.parse(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
};

/**
 * The events an agent needs to plan around: title, local start and end, all-day flag and place.
 * It drops ids, source ids and the meeting link (`hasJoinLink` says whether one exists), and the
 * calendar feed links never reach it at all.
 */
export function calendarEvents(events: ReadonlyArray<CalendarEvent>, timeZone: string) {
  return events
    .toSorted((left, right) => left.start.localeCompare(right.start))
    .map((event) => {
      const start = wall(event.start, timeZone);
      const end = wall(event.end, timeZone);
      return {
        title: event.title,
        allDay: event.allDay,
        // An all-day event shows dates only: a midnight time would read as a real meeting.
        start: event.allDay ? start.date : `${start.date} ${start.time}`,
        end: event.allDay ? end.date : `${end.date} ${end.time}`,
        ...(event.location === undefined ? {} : { location: event.location }),
        hasJoinLink: event.joinUrl !== undefined,
      };
    });
}

/** The range is valid when `from` is before `to` and spans at most `MAX_RANGE_DAYS`. */
export function rangeError(from: string, to: string): string | null {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end))
    return "from and to must be ISO timestamps.";
  if (end <= start) return "to must be after from.";
  if (end - start > MAX_RANGE_DAYS * 86_400_000)
    return `The range may span at most ${MAX_RANGE_DAYS} days.`;
  return null;
}
