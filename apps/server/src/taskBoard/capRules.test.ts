import { describe, expect, it } from "@effect/vitest";

import {
  capLevel,
  capProblem,
  parseCapRule,
  swapSuggestions,
  withCapLines,
  type CapCard,
} from "./capRules.ts";

describe("withCapLines", () => {
  it("sets both lines and keeps every other line, so parseCapRule reads them back", () => {
    const md = "---\ntype: project\nname: Demo\ncap: 3\n---\n\n# Demo\nNotes stay.\n";
    const next = withCapLines(md, 8, 5);
    expect(next).toBe(
      "---\ntype: project\nname: Demo\ncap: 8\nwarn: 5\n---\n\n# Demo\nNotes stay.\n",
    );
    expect(parseCapRule(next, "demo")).toEqual({ cap: 8, warn: 5 });
  });
  it("adds a front matter block when the file has none, or when there is no file", () => {
    expect(withCapLines("# Demo\n", 4, 2)).toBe("---\ncap: 4\nwarn: 2\n---\n# Demo\n");
    expect(parseCapRule(withCapLines(null, 4, 2), "demo")).toEqual({ cap: 4, warn: 2 });
  });
  it("keeps Windows line endings and an empty front matter", () => {
    expect(withCapLines("---\r\nname: Demo\r\n---\r\nBody\r\n", 6, 3)).toBe(
      "---\r\nname: Demo\r\ncap: 6\r\nwarn: 3\r\n---\r\nBody\r\n",
    );
    expect(withCapLines("---\n---\nBody\n", 6, 3)).toBe("---\ncap: 6\nwarn: 3\n---\nBody\n");
  });
  it("ends the front matter only at a line of three dashes, not at dashes inside a value", () => {
    const md = "---\nname: a---b\nstatus: active\n---\nBody\n";
    const next = withCapLines(md, 7, 4);
    expect(next).toBe("---\nname: a---b\nstatus: active\ncap: 7\nwarn: 4\n---\nBody\n");
    expect(parseCapRule(next, "demo")).toEqual({ cap: 7, warn: 4 });
  });
  it("keeps a byte-order mark first and edits the front matter after it", () => {
    // 14 of the 18 project.md files in the author's AIOS start with a byte-order mark.
    const md = "﻿---\ntype: project\nname: Demo\n---\nBody\n";
    const next = withCapLines(md, 7, 4);
    expect(next).toBe("﻿---\ntype: project\nname: Demo\ncap: 7\nwarn: 4\n---\nBody\n");
    expect(parseCapRule(next, "demo")).toEqual({ cap: 7, warn: 4 });
    expect(withCapLines("﻿# Demo\n", 4, 2)).toBe("﻿---\ncap: 4\nwarn: 2\n---\n# Demo\n");
  });
  it("reads the limit from a file with a byte-order mark and Windows line ends", () => {
    expect(parseCapRule("﻿---\r\ncap: 9\r\nwarn: 5\r\n---\r\nBody\r\n", "demo")).toEqual({
      cap: 9,
      warn: 5,
    });
  });
  it("does not take a rule line in the body for front matter", () => {
    const next = withCapLines("# Notes\n\n---\ncap: 99\n---\nmore\n", 4, 2);
    expect(next).toBe("---\ncap: 4\nwarn: 2\n---\n# Notes\n\n---\ncap: 99\n---\nmore\n");
    expect(parseCapRule(next, "demo")).toEqual({ cap: 4, warn: 2 });
  });
});

describe("capProblem", () => {
  it("accepts a good pair and refuses the rest in plain words", () => {
    expect(capProblem(10, 6)).toBeNull();
    expect(capProblem(10, 0)).toBeNull();
    expect(capProblem(10, 10)).toBeNull();
    for (const [cap, warn] of [
      [0, 0],
      [-3, 1],
      [10, 11],
      [10, -1],
      [2.5, 1],
      [10, Number.NaN],
      [10_000, 5],
    ] as const) {
      expect(capProblem(cap, warn)).toEqual(expect.any(String));
    }
  });
});

const card = (n: number, over: Partial<CapCard> = {}): CapCard => ({
  id: `task-${n}`,
  title: `Chore ${n}`,
  status: "todo",
  priority: "medium",
  createdAt: n,
  projectSlug: "leonidas-code",
  ...over,
});

const many = (count: number, over: Partial<CapCard> = {}) =>
  Array.from({ length: count }, (_, i) => card(i, over));

describe("parseCapRule", () => {
  it("reads cap and warn from project.md frontmatter, else the defaults", () => {
    expect(parseCapRule("---\ntype: project\ncap: 3\nwarn: 2\n---\n", "leonidas-code")).toEqual({
      cap: 3,
      warn: 2,
    });
    expect(parseCapRule("---\ntype: project\ncap: 10\n---\n", "leonidas-code")).toEqual({
      cap: 10,
      warn: 6,
    });
    expect(parseCapRule(null, "leonidas-code")).toEqual({ cap: 50, warn: 30 });
    expect(parseCapRule(null, null)).toEqual({ cap: 30, warn: 18 });
  });
});

describe("capLevel", () => {
  it("counts only open cards of the project", () => {
    const cards = [...many(49), card(100, { status: "done" }), card(101, { projectSlug: "other" })];
    expect(capLevel(cards, "leonidas-code", { cap: 50, warn: 30 })).toMatchObject({
      open: 49,
      level: "warn",
    });
  });

  it("is full at the cap and ok below the warn line", () => {
    expect(capLevel(many(50), "leonidas-code", { cap: 50, warn: 30 }).level).toBe("full");
    expect(capLevel(many(3), "leonidas-code", { cap: 50, warn: 30 }).level).toBe("ok");
  });

  it("treats a missing slug as the Inbox", () => {
    const inbox = many(30, { projectSlug: null });
    expect(capLevel(inbox, null, { cap: 30, warn: 18 }).level).toBe("full");
  });
});

describe("swapSuggestions", () => {
  it("names the 3 lowest-priority, oldest cards that nobody is working on", () => {
    const cards = [
      card(1, { priority: "high" }),
      card(2, { priority: "low", createdAt: 20 }),
      card(3, { priority: "low", createdAt: 10 }),
      card(4, { priority: "low", createdAt: 5, status: "in_progress" }),
      card(5, { priority: "low", createdAt: 1, status: "blocked" }),
      card(6, { priority: "low", createdAt: 1, status: "review" }),
      card(7, { priority: "medium", createdAt: 2 }),
      card(8, { priority: "low", createdAt: 30, projectSlug: "other" }),
    ];
    expect(swapSuggestions(cards, "leonidas-code").map((c) => c.id)).toEqual([
      "task-3",
      "task-2",
      "task-7",
    ]);
  });
});
