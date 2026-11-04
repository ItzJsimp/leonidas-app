import { describe, expect, it } from "vite-plus/test";

import {
  countMentionedSkills,
  hoistCommandToPromptStart,
  prefixPromptWithSkill,
  prefixPromptWithSkills,
} from "./composerSkillPrefix";

describe("prefixPromptWithSkills", () => {
  it("leads the prompt with the skills in rank order", () => {
    expect(prefixPromptWithSkills("fix the bug", ["tdd", "review"])).toBe(
      "$tdd $review fix the bug",
    );
  });

  it("leaves the prompt unchanged for an empty list", () => {
    expect(prefixPromptWithSkills("fix the bug", [])).toBe("fix the bug");
  });

  it("does not repeat a skill that already leads", () => {
    expect(prefixPromptWithSkills("$tdd fix the bug", ["tdd"])).toBe("$tdd fix the bug");
  });
});

describe("prefixPromptWithSkill", () => {
  it("leads an empty prompt with the skill", () => {
    expect(prefixPromptWithSkill("", "grill-me")).toBe("$grill-me ");
  });

  it("puts the skill before existing text", () => {
    expect(prefixPromptWithSkill("fix the bug", "tdd")).toBe("$tdd fix the bug");
  });

  it("keeps the prompt when that skill already leads it", () => {
    expect(prefixPromptWithSkill("$tdd fix the bug", "tdd")).toBe("$tdd fix the bug");
    expect(prefixPromptWithSkill("$tdd", "tdd")).toBe("$tdd");
  });

  it("does not mistake a longer skill name for the same skill", () => {
    expect(prefixPromptWithSkill("$tdd-extra go", "tdd")).toBe("$tdd $tdd-extra go");
  });
});

describe("countMentionedSkills", () => {
  it("counts each known skill once", () => {
    const known = new Set(["tdd", "grill-me"]);
    expect(countMentionedSkills("$tdd a $grill-me b $tdd $nope", known)).toBe(2);
  });
});

describe("hoistCommandToPromptStart", () => {
  it("moves the command in front of the text before it", () => {
    expect(hoistCommandToPromptStart("fix this /com", "compact", "fix this ".length)).toBe(
      "/compact fix this ",
    );
  });

  it("leads a skill as a $ mention so it becomes a chip", () => {
    expect(
      hoistCommandToPromptStart("fix this /cod", "codebase-design", "fix this ".length, true),
    ).toBe("$codebase-design fix this ");
  });
});
