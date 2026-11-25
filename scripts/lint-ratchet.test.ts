import { describe, expect, it } from "@effect/vitest";

import { compareCounts, countErrors } from "./lint-ratchet.ts";

describe("lint ratchet", () => {
  it("counts errors per file and rule and ignores warnings", () => {
    expect(
      countErrors([
        { severity: "error", filename: "b.ts", code: "rule", message: "x" },
        { severity: "error", filename: "b.ts", code: "rule", message: "y" },
        { severity: "warning", filename: "b.ts", code: "rule", message: "z" },
        { severity: "error", filename: "a.ts", message: "parse" },
      ]),
    ).toEqual({ "a.ts\tparse-error": 1, "b.ts\trule": 2 });
  });

  it("reports grown and shrunk pairs, including new and removed files", () => {
    expect(
      compareCounts(
        { "a.ts\tr": 2, "gone.ts\tr": 1, "same.ts\tr": 1 },
        { "a.ts\tr": 3, "new.ts\tr": 1, "same.ts\tr": 1 },
      ),
    ).toEqual({ grown: ["a.ts\tr", "new.ts\tr"], shrunk: ["gone.ts\tr"] });
  });
});
