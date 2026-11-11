import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveSnoozePresets, snoozeWakeDescription } from "./Sidebar.snooze";

function localDate(year: number, month: number, day: number, hour: number, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

const HOUR = "after:60";
const THREE_HOURS = "after:180";
const EVENING = "at:today:18:00";
const TOMORROW = "at:tomorrow:09:00";
const NEXT_WEEK = "at:monday:09:00";
const environmentId = EnvironmentId.make("env-1");

describe("resolveSnoozePresets", () => {
  it("offers one hour, three hours, evening, tomorrow, and next week in the morning", () => {
    const presets = resolveSnoozePresets(localDate(2026, 4, 8, 10), "locale", environmentId);
    expect(presets.map((preset) => preset.id)).toEqual([
      HOUR,
      THREE_HOURS,
      EVENING,
      TOMORROW,
      NEXT_WEEK,
    ]);
    const threeHours = presets.find((preset) => preset.id === THREE_HOURS);
    expect(new Date(threeHours!.snoozedUntil).getHours()).toBe(13);
    const evening = presets.find((preset) => preset.id === EVENING);
    expect(new Date(evening!.snoozedUntil).getHours()).toBe(18);
    const tomorrow = presets.find((preset) => preset.id === TOMORROW);
    const tomorrowDate = new Date(tomorrow!.snoozedUntil);
    expect(tomorrowDate.getDate()).toBe(9);
    expect(tomorrowDate.getHours()).toBe(9);
    const nextWeek = presets.find((preset) => preset.id === NEXT_WEEK);
    const nextWeekDate = new Date(nextWeek!.snoozedUntil);
    expect(nextWeekDate.getDay()).toBe(1);
    expect(nextWeekDate.getDate()).toBe(13);
  });

  it("whenLabel complements the label instead of repeating it", () => {
    const presets = resolveSnoozePresets(localDate(2026, 4, 8, 10), "locale", environmentId);
    for (const preset of presets) {
      expect(preset.whenLabel.toLowerCase()).not.toContain("tomorrow");
    }
    const tomorrow = presets.find((preset) => preset.id === TOMORROW);
    expect(tomorrow!.whenLabel).toMatch(/9/);
    const nextWeek = presets.find((preset) => preset.id === NEXT_WEEK);
    expect(nextWeek!.whenLabel).toMatch(/Mon/);
  });

  it("drops the evening preset once its time has passed", () => {
    expect(
      resolveSnoozePresets(localDate(2026, 4, 8, 17, 30), "locale", environmentId).map(
        (preset) => preset.id,
      ),
    ).toEqual([EVENING, HOUR, THREE_HOURS, TOMORROW, NEXT_WEEK]);
    expect(
      resolveSnoozePresets(localDate(2026, 4, 8, 21), "locale", environmentId).map(
        (preset) => preset.id,
      ),
    ).toEqual([HOUR, THREE_HOURS, TOMORROW, NEXT_WEEK]);
  });

  it("puts next week a full week out when today is Monday", () => {
    const presets = resolveSnoozePresets(localDate(2026, 4, 6, 10), "locale", environmentId);
    const nextWeek = new Date(presets.find((preset) => preset.id === NEXT_WEEK)!.snoozedUntil);
    expect(nextWeek.getDay()).toBe(1);
    expect(nextWeek.getDate()).toBe(13);
  });
  it("formats preset times with the selected clock preference", () => {
    const now = localDate(2026, 4, 8, 10);
    const twelveHour = resolveSnoozePresets(now, "12-hour", environmentId);
    const twentyFourHour = resolveSnoozePresets(now, "24-hour", environmentId);

    expect(twelveHour.find((preset) => preset.id === EVENING)!.whenLabel).toMatch(/PM/i);
    expect(twentyFourHour.find((preset) => preset.id === EVENING)!.whenLabel).toBe("18:00");
  });
});

describe("snoozeWakeDescription", () => {
  const now = localDate(2026, 4, 8, 10);

  it("uses bare time today, 'tomorrow' next day, weekday within the week", () => {
    expect(
      snoozeWakeDescription(localDate(2026, 4, 8, 18).toISOString(), now, "locale"),
    ).not.toContain("tomorrow");
    expect(snoozeWakeDescription(localDate(2026, 4, 9, 9).toISOString(), now, "locale")).toContain(
      "tomorrow",
    );
    expect(snoozeWakeDescription(localDate(2026, 4, 13, 9).toISOString(), now, "locale")).toMatch(
      /Mon/,
    );
  });

  it("formats wake descriptions with the selected clock preference", () => {
    expect(snoozeWakeDescription(localDate(2026, 4, 8, 18).toISOString(), now, "12-hour")).toMatch(
      /PM/i,
    );
    expect(snoozeWakeDescription(localDate(2026, 4, 8, 18).toISOString(), now, "24-hour")).toBe(
      "18:00",
    );
  });
});
