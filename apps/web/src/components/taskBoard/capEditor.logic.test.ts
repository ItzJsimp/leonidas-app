import { describe, expect, it } from "vite-plus/test";

import { capFormProblem, capLowerNote, DEFAULT_CAP, DEFAULT_WARN } from "./capEditor.logic";

describe("capFormProblem", () => {
  it("accepts the defaults and the edges", () => {
    expect(capFormProblem(DEFAULT_CAP, DEFAULT_WARN)).toBeNull();
    expect(capFormProblem(1, 0)).toBeNull();
    expect(capFormProblem(9999, 9999)).toBeNull();
  });

  it.each([
    ["an empty limit", null, 5, "Use whole numbers."],
    ["an empty warning", 10, null, "Use whole numbers."],
    ["a decimal", 2.5, 1, "Use whole numbers."],
    ["zero", 0, 0, "The limit must be from 1 to 9999."],
    ["a negative limit", -4, 0, "The limit must be from 1 to 9999."],
    ["a limit above the top", 10_000, 5, "The limit must be from 1 to 9999."],
    ["a negative warning", 10, -1, "The warning must be from 0 up to the limit."],
    ["a warning above the limit", 10, 11, "The warning must be from 0 up to the limit."],
  ])("refuses %s", (_name, cap, warn, message) => {
    expect(capFormProblem(cap, warn)).toBe(message);
  });

  it("matches the default warning the server computes", () => {
    expect(DEFAULT_WARN).toBe(Math.floor(DEFAULT_CAP * 0.6));
  });
});

describe("capLowerNote", () => {
  it("warns only when the limit is below the open count", () => {
    expect(capLowerNote(10, 12)).toBe("12 tasks are open, so this project shows as full at once.");
    expect(capLowerNote(12, 12)).toBeNull();
    expect(capLowerNote(null, 12)).toBeNull();
  });
});
