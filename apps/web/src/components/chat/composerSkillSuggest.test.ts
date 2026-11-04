import type { ServerProviderSkill } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import fixture from "./composerSkillSuggest.fixture.json";
import { rankSkills } from "./composerSkillSuggest";

const skills = fixture.skills.map((skill): ServerProviderSkill => ({
  name: skill.name,
  description: skill.description,
  path: `/skills/${skill.name}/SKILL.md`,
  enabled: true,
}));

const rank = (prompt: string, extra: Partial<Parameters<typeof rankSkills>[0]> = {}) =>
  rankSkills({ prompt, projectText: "", skills, cap: 3, ...extra }).map((pick) => pick.name);

describe("rankSkills quality on the spike fixture", () => {
  const positives = fixture.cases.filter((c) => c.expected.length > 0);
  const negatives = fixture.cases.filter((c) => c.expected.length === 0);

  it("finds an expected skill in the picks for at least 16 of 22 prompts", () => {
    const hits = positives.filter((c) => rank(c.prompt).some((n) => c.expected.includes(n)));
    expect(positives).toHaveLength(22);
    expect(hits.length).toBeGreaterThanOrEqual(16);
  });

  it("picks nothing for the no-skill prompts", () => {
    for (const c of negatives) expect(rank(c.prompt), c.prompt).toEqual([]);
  });

  it("ranks 170 skills in under 50 ms", () => {
    const many = Array.from({ length: 170 }, (_, i) => skills[i % skills.length]!).map(
      (skill, i) => ({ ...skill, name: `${skill.name}-${i}` }),
    );
    const start = performance.now();
    rankSkills({
      prompt: "Review my diff before I push it",
      projectText: "",
      skills: many,
      cap: 3,
    });
    expect(performance.now() - start).toBeLessThan(50);
  });
});

describe("rankSkills rules", () => {
  it("returns nothing for an empty draft", () => {
    expect(rank("   ")).toEqual([]);
  });

  it("honors the cap", () => {
    const prompt = "review the diff, write a failing test first, and tune the slow SQL query";
    const five = rank(prompt, { cap: 5 });
    expect(five.length).toBeGreaterThan(2);
    expect(five.length).toBeLessThanOrEqual(5);
    expect(rank(prompt, { cap: 1 })).toEqual(five.slice(0, 1));
    expect(rank(prompt, { cap: 2 })).toEqual(five.slice(0, 2));
  });

  it("skips skills the prompt already names", () => {
    expect(rank("$grilling Grill me on my idea for a habit tracker app")).not.toContain("grilling");
    expect(rank("Grill me on my idea for a habit tracker app")).toContain("grilling");
  });

  it("skips disabled and user-hidden skills", () => {
    const off = skills.map((s) => (s.name === "grilling" ? { ...s, enabled: false } : s));
    const hidden = skills.map((s) => (s.name === "grilling" ? { ...s, userInvocable: false } : s));
    const prompt = "Grill me on my idea for a habit tracker app";
    expect(
      rankSkills({ prompt, projectText: "", skills: off, cap: 3 }).map((p) => p.name),
    ).not.toContain("grilling");
    expect(
      rankSkills({ prompt, projectText: "", skills: hidden, cap: 3 }).map((p) => p.name),
    ).not.toContain("grilling");
  });

  it("uses only the skills it is given, so a project switch changes the pool", () => {
    const without = skills.filter((s) => s.name !== "windows-toast");
    const prompt = "Send me a desktop toast when the build finishes";
    expect(rank(prompt)).toContain("windows-toast");
    expect(rank(prompt, { skills: without })).not.toContain("windows-toast");
  });

  it("returns picks best first", () => {
    const picks = rankSkills({
      prompt: "Review my diff before I push it",
      projectText: "",
      skills,
      cap: 5,
    });
    const scores = picks.map((p) => p.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
});
