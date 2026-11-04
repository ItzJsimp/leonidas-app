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
    // Six skills with the same text score the same, so only the cap limits the picks.
    const twins = [1, 2, 3, 4, 5, 6].map((id) => ({
      ...skills[0]!,
      name: `twin-x${id}`,
      description: "deploy release pipeline",
    }));
    const pick = (cap: number) =>
      rankSkills({ prompt: "deploy the release pipeline", projectText: "", skills: twins, cap });
    expect(pick(1)).toHaveLength(1);
    expect(pick(3)).toHaveLength(3);
    expect(pick(5)).toHaveLength(5);
  });

  it("still picks from a project that has only a few skills", () => {
    const few = [
      {
        ...skills[0]!,
        name: "relnotes",
        description:
          "Write release notes for a version with sections highlights details and credits",
      },
      { ...skills[0]!, name: "db-migrate", description: "Run database migrations safely" },
      { ...skills[0]!, name: "lint-fix", description: "Fix lint errors across the repository" },
    ];
    const picks = rankSkills({
      prompt: "release notes please",
      projectText: "",
      skills: few,
      cap: 3,
    });
    expect(picks.map((p) => p.name)).toEqual(["relnotes"]);
  });

  it("drops a pick that is much weaker than the best one", () => {
    const strong = { ...skills[0]!, name: "strong", description: "review diff" };
    const weak = {
      ...skills[0]!,
      name: "weak",
      description: "review diff cooking gardening travel music sports",
    };
    const picks = rankSkills({
      prompt: "review diff",
      projectText: "",
      skills: [strong, weak],
      cap: 3,
    });
    expect(picks.map((p) => p.name)).toEqual(["strong"]);
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
