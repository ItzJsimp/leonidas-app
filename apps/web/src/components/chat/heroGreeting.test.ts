import { describe, expect, it } from "vite-plus/test";

import { greetingMoment, heroGreeting } from "./heroGreeting";

// 2026-11-10 is a Tuesday; 2026-11-09 a Monday; 2026-11-13 a Friday.
const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0);

describe("greetingMoment", () => {
  it("follows the time of day", () => {
    expect(greetingMoment(at(10, 5))).toBe("morning");
    expect(greetingMoment(at(10, 12))).toBe("afternoon");
    expect(greetingMoment(at(10, 17))).toBe("evening");
    expect(greetingMoment(at(10, 22))).toBe("late");
    expect(greetingMoment(at(10, 4))).toBe("late");
  });

  it("uses the weekday moments only in their window", () => {
    expect(greetingMoment(at(9, 8))).toBe("monday");
    expect(greetingMoment(at(9, 13))).toBe("afternoon");
    expect(greetingMoment(at(13, 14))).toBe("friday");
    expect(greetingMoment(at(13, 19))).toBe("evening");
  });
});

describe("heroGreeting", () => {
  it("adds the name after a comma, or leaves it out", () => {
    expect(heroGreeting(at(10, 8), "Jake").title).toMatch(/, Jake$/);
    expect(heroGreeting(at(10, 8), "  ").title).not.toContain(",");
    expect(heroGreeting(at(10, 23), "Jake").title).toMatch(/, Jake\?$/);
  });

  it("stays the same all day", () => {
    expect(heroGreeting(at(10, 13), "Jake")).toEqual(heroGreeting(at(10, 16), "Jake"));
  });
});
