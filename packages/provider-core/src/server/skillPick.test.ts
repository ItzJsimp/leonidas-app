import { describe, expect, it } from "vite-plus/test";

import { buildSkillPickPrompt, sanitizeSkillPicks } from "./skillPick.ts";

const candidates = [
  { name: "tdd", description: "Test-driven development: red, green, refactor." },
  { name: "ux-copy", description: "Write UX copy.", scope: "project" },
  { name: "review-diff", description: "Review the diff." },
];

describe("buildSkillPickPrompt", () => {
  const { prompt } = buildSkillPickPrompt({
    request: 'Fix the "login" bug',
    project: "my-app",
    alreadyAdded: ["tdd"],
    candidates,
    max: 2,
  });

  it("lists every candidate, marks project skills and states the limit", () => {
    expect(prompt).toContain("- tdd: Test-driven development");
    expect(prompt).toContain("- ux-copy (project): Write UX copy.");
    expect(prompt).toContain("Max: 2");
    expect(prompt).toContain('Already added: ["tdd"]');
  });

  it("quotes the request as data and allows an empty answer", () => {
    expect(prompt).toContain('Request: "Fix the \\"login\\" bug"');
    expect(prompt).toContain("Picking nothing is a correct answer");
  });
});

describe("sanitizeSkillPicks", () => {
  const rules = { candidates, alreadyAdded: [] as string[], max: 2 };

  it("drops invented names and repeats, and fixes case and a leading $", () => {
    const picks = sanitizeSkillPicks(
      [
        { name: "made-up", reason: "x" },
        { name: "$TDD", reason: "builds the fix test first" },
        { name: "tdd", reason: "again" },
        { name: "review-diff", reason: "check the change" },
      ],
      rules,
    );
    expect(picks.map((pick) => pick.name)).toEqual(["tdd", "review-diff"]);
  });

  it("stops at max and never returns a skill that is already added", () => {
    const raw = candidates.map((skill) => ({ name: skill.name, reason: "r" }));
    expect(sanitizeSkillPicks(raw, { ...rules, max: 1 })).toHaveLength(1);
    expect(
      sanitizeSkillPicks(raw, { ...rules, alreadyAdded: ["tdd"], max: 5 }).map((p) => p.name),
    ).toEqual(["ux-copy", "review-diff"]);
    expect(sanitizeSkillPicks(raw, { ...rules, max: 0 })).toEqual([]);
  });

  it("cleans the reason", () => {
    const [pick] = sanitizeSkillPicks(
      [{ name: "tdd", reason: `  **bold**\n  ${"long ".repeat(40)}` }],
      rules,
    );
    expect(pick!.reason).not.toMatch(/[*\n]/);
    expect(pick!.reason.length).toBeLessThanOrEqual(80);
  });
});
