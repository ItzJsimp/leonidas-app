import { describe, expect, it } from "@effect/vitest";

import { capLevel, parseCapRule, swapSuggestions, type CapCard } from "./capRules.ts";

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
