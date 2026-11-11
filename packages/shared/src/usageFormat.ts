// @effect-diagnostics globalDate:off -- Usage windows are calendar days in the viewer's zone, derived from wall-clock "now" via Intl.
import { UsageDay, type UsageResolution, type UsageSummaryInput } from "@t3tools/contracts";

import type { UsageContractMismatch } from "./usageMerge.ts";

const CURRENCY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const INTEGER = new Intl.NumberFormat("en-US");

export function formatUsd(value: number): string {
  return Number.isFinite(value) ? CURRENCY.format(value) : "Unavailable";
}

export function formatCount(value: number): string {
  return Number.isFinite(value) ? INTEGER.format(Math.round(value)) : "Unavailable";
}

export function formatTokens(value: number): string {
  if (!Number.isFinite(value)) return "Unavailable";
  const abs = Math.abs(value);
  // Promote at the rounding boundary rather than displaying 1000K or 1000M.
  if (abs >= 999.5e9) return `${trim(value / 1e12)}T`;
  if (abs >= 999.5e6) return `${trim(value / 1e9)}B`;
  if (abs >= 999.5e3) return `${trim(value / 1e6)}M`;
  if (abs >= 999.5) return `${trim(value / 1e3)}K`;
  return INTEGER.format(Math.round(value));
}

function trim(value: number): string {
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  return value.toFixed(digits).replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
}

export function formatPercent(share: number, digits = 1): string {
  if (!Number.isFinite(share)) return "Unavailable";
  digits = Number.isFinite(digits) ? Math.max(0, Math.min(6, Math.trunc(digits))) : 1;
  const percent = share * 100;
  const smallest = 10 ** -digits;
  if (percent > 0 && percent < smallest) return `<${smallest.toFixed(digits)}%`;
  return `${percent.toFixed(digits)}%`;
}

export function formatUsageContractMismatch(
  environmentLabel: string,
  mismatch: Pick<UsageContractMismatch, "direction">,
): string {
  return mismatch.direction === "serverBehind"
    ? `${environmentLabel} runs an older server version and is excluded from totals.`
    : `This client is older than the server on ${environmentLabel}; its usage is excluded from totals.`;
}

export function formatDayShort(day: string): string {
  if (!validUsageDay(day)) return day;
  const [year, month, dayOfMonth] = day.split("-").map((part) => Number(part));
  if (year === undefined || month === undefined || dayOfMonth === undefined) return day;
  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${MONTHS[month - 1] ?? ""} ${dayOfMonth}`;
}

function validUsageDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const timestamp = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === day;
}

// Malformed restored windows must not allocate millions of chart buckets.
const MAX_USAGE_BUCKETS = 10_000;

/** Inclusive day list between two `YYYY-MM-DD` bounds. */
export function enumerateDays(sinceDay: string, untilDay: string): readonly string[] {
  const days: string[] = [];
  if (!validUsageDay(sinceDay) || !validUsageDay(untilDay)) return days;
  const start = Date.parse(`${sinceDay}T00:00:00Z`);
  const end = Date.parse(`${untilDay}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return days;
  if ((end - start) / 86_400_000 + 1 > MAX_USAGE_BUCKETS) return days;

  for (let cursor = start; cursor <= end; cursor += 86_400_000) {
    days.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return days;
}

const HOUR_MS = 60 * 60 * 1000;

const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();

function dateTimeFormatter(
  locale: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  if (options.timeZone === undefined) return new Intl.DateTimeFormat(locale, options);
  const key = JSON.stringify([locale, options]);
  let formatter = dateTimeFormatters.get(key);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat(locale, options);
    if (dateTimeFormatters.size >= 16) dateTimeFormatters.clear();
    dateTimeFormatters.set(key, formatter);
  }
  return formatter;
}

export function enumerateHourStarts(
  sinceTime: string,
  untilTime: string,
  bucketMinutes = 60,
): readonly string[] {
  const starts: string[] = [];
  const start = Date.parse(sinceTime);
  const end = Date.parse(untilTime);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return starts;
  if (Math.ceil((end - start) / HOUR_MS) > MAX_USAGE_BUCKETS) return starts;

  for (let cursor = start; cursor < end; cursor += bucketMinutes * 60_000) {
    starts.push(new Date(cursor).toISOString());
  }
  return starts;
}

function hourOptions(hour12: boolean): Intl.DateTimeFormatOptions {
  return hour12 ? { hour: "numeric" } : { hour: "2-digit", hourCycle: "h23" };
}

function formatHour(formatter: Intl.DateTimeFormat, date: Date, hour12: boolean): string {
  if (hour12) return formatter.format(date);
  // Rolling buckets can start between whole hours, but their labels always name the hour.
  return formatter
    .formatToParts(date)
    .map((part) => (part.type === "hour" ? `${part.value}:00` : part.value))
    .join("");
}

/**
 * Repeated wall-clock hours during a fall-back transition include their short zone name so the
 * two distinct buckets remain distinguishable.
 */
export function formatHourShort(
  hourStart: string,
  timeZone?: string,
  hour12 = true,
  /** Sub-hour buckets need the minute to tell neighbours apart. */
  withMinutes = false,
): string {
  const instant = new Date(hourStart);
  if (Number.isNaN(instant.getTime())) return hourStart;
  const options = timeZone === undefined ? {} : { timeZone };
  if (withMinutes) {
    return dateTimeFormatter("en-US", { ...options, hour: "numeric", minute: "2-digit" }).format(
      instant,
    );
  }
  const hourFormat = dateTimeFormatter("en-US", {
    ...options,
    ...hourOptions(hour12),
  });
  const wallHourFormat = dateTimeFormatter("en-CA", {
    ...options,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const wallHour = wallHourFormat.format(instant);
  const isRepeatedHour = [-HOUR_MS, HOUR_MS].some(
    (offset) => wallHourFormat.format(new Date(instant.getTime() + offset)) === wallHour,
  );

  if (!isRepeatedHour) return formatHour(hourFormat, instant, hour12);
  const zonedHourFormat = dateTimeFormatter("en-US", {
    ...options,
    ...hourOptions(hour12),
    timeZoneName: "short",
  });
  return formatHour(zonedHourFormat, instant, hour12);
}

/** `2026-08-11T14:37:00Z` to `Aug 11, 2 PM` in the requested zone. */
export function formatDateTimeShort(
  instant: string,
  timeZone?: string,
  hour12 = true,
  withMinutes = false,
): string {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return instant;
  const dateHourFormat = dateTimeFormatter("en-US", {
    ...(timeZone === undefined ? {} : { timeZone }),
    month: "short",
    day: "numeric",
    ...hourOptions(hour12),
    ...(withMinutes ? { minute: "2-digit" } : {}),
  });
  return formatHour(dateHourFormat, date, hour12);
}

export function formatRelativeHourShort(
  hourStart: string,
  relativeTo: string,
  timeZone?: string,
  hour12 = true,
  withMinutes = false,
): string {
  const instant = new Date(hourStart);
  const reference = new Date(relativeTo);
  if (Number.isNaN(instant.getTime()) || Number.isNaN(reference.getTime())) {
    return formatDateTimeShort(hourStart, timeZone, hour12, withMinutes);
  }

  const dayFormat = dateTimeFormatter("en-CA", {
    ...(timeZone === undefined ? {} : { timeZone }),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const instantDay = Date.parse(`${dayFormat.format(instant)}T00:00:00Z`);
  const referenceDay = Date.parse(`${dayFormat.format(reference)}T00:00:00Z`);
  const calendarDaysAgo = Math.round((referenceDay - instantDay) / (24 * HOUR_MS));
  const hour = formatHourShort(hourStart, timeZone, hour12, withMinutes);

  if (calendarDaysAgo === 0) return `${hour} today`;
  if (calendarDaysAgo === 1) return `${hour} yesterday`;
  return formatDateTimeShort(hourStart, timeZone, hour12, withMinutes);
}

export function makeWindow(
  days: number,
  now = new Date(),
  resolution: UsageResolution = "day",
  /** Hourly resolution only: the rolling span and how finely to bucket it. */
  hourly: { readonly minutes: number; readonly bucketMinutes: number } = {
    minutes: 24 * 60,
    bucketMinutes: 60,
  },
): UsageSummaryInput {
  let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    timeZone = "UTC";
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }
  const untilDay = format.format(now);
  if (resolution === "hour") {
    const untilTimeMs = Math.floor(now.getTime() / 60_000) * 60_000;
    const sinceTimeMs = untilTimeMs - hourly.minutes * 60_000;
    const sinceTime = new Date(sinceTimeMs);
    const untilTime = new Date(untilTimeMs);
    return {
      sinceDay: UsageDay.make(format.format(sinceTime)),
      untilDay: UsageDay.make(format.format(untilTime)),
      timeZone,
      resolution,
      sinceTime: sinceTime.toISOString(),
      untilTime: untilTime.toISOString(),
      ...(hourly.bucketMinutes === 60 ? {} : { bucketMinutes: hourly.bucketMinutes }),
    };
  }
  // Subtracting fixed milliseconds from `now` lands on the wrong calendar day
  // around a DST transition. The window start is pure calendar arithmetic on
  // the local end day, done in UTC where days are uniform.
  const [year = 0, month = 1, dayOfMonth = 1] = untilDay
    .split("-")
    .map((part) => Number.parseInt(part, 10));
  const start = new Date(Date.UTC(year, month - 1, dayOfMonth - (days - 1)));
  return {
    sinceDay: UsageDay.make(start.toISOString().slice(0, 10)),
    untilDay: UsageDay.make(untilDay),
    timeZone,
    resolution,
  };
}
