import type { CalendarEvent } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import { calendarEvents, MAX_RANGE_DAYS, rangeError } from "./calendarEvents.ts";

const event = (over: Partial<CalendarEvent>) =>
  ({
    id: "secret-id",
    sourceId: "secret-source",
    title: "Standup",
    start: "2026-11-09T16:00:00.000Z",
    end: "2026-11-09T16:30:00.000Z",
    allDay: false,
    ...over,
  }) as CalendarEvent;

describe("calendarEvents", () => {
  it("returns nothing for an empty range", () => {
    expect(calendarEvents([], "America/Phoenix")).toEqual([]);
  });

  it("shows a timed event on the wall clock of the zone", () => {
    const [entry] = calendarEvents([event({})], "America/Phoenix");
    expect(entry).toMatchObject({
      start: "2026-11-09 09:00",
      end: "2026-11-09 09:30",
      allDay: false,
    });
  });

  it("shows an all-day event as dates only", () => {
    const [entry] = calendarEvents(
      [event({ allDay: true, start: "2026-11-09T07:00:00.000Z", end: "2026-11-10T07:00:00.000Z" })],
      "America/Phoenix",
    );
    expect(entry).toMatchObject({ allDay: true, start: "2026-11-09", end: "2026-11-10" });
  });

  it("sorts by start, hides ids, and reports a join link without its address", () => {
    const out = calendarEvents(
      [
        event({ title: "Later", start: "2026-11-09T20:00:00.000Z" }),
        event({ title: "Sooner", joinUrl: "https://meet.example/abc" }),
      ],
      "UTC",
    );
    expect(out.map((entry) => entry.title)).toEqual(["Sooner", "Later"]);
    expect(out[0]?.hasJoinLink).toBe(true);
    expect(JSON.stringify(out)).not.toMatch(/secret|meet\.example/);
  });
});

describe("rangeError", () => {
  it("accepts a normal range and refuses reversed, huge or invalid ranges", () => {
    expect(rangeError("2026-11-09T00:00:00Z", "2026-11-10T00:00:00Z")).toBeNull();
    expect(rangeError("2026-11-10T00:00:00Z", "2026-11-09T00:00:00Z")).not.toBeNull();
    expect(rangeError("2026-01-01T00:00:00Z", `2027-01-01T00:00:00Z`)).toContain(
      String(MAX_RANGE_DAYS),
    );
    expect(rangeError("nope", "2026-11-09T00:00:00Z")).not.toBeNull();
  });
});
