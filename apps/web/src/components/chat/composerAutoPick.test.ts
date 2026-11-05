import type { ServerProviderSkill } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  autoPickSkills,
  describeEngine,
  describePicks,
  type ModelRequest,
} from "./composerAutoPick";
import fixture from "./composerSkillSuggest.fixture.json";
import { SHORTLIST_SIZE } from "./composerSkillSuggest";

const skills = fixture.skills.map((skill): ServerProviderSkill => ({
  name: skill.name,
  description: skill.description,
  path: `/skills/${skill.name}/SKILL.md`,
  enabled: true,
}));
const prompt = "Review my diff before I push it";

const run = (
  askModel: Parameters<typeof autoPickSkills>[0]["askModel"],
  extra: Partial<Parameters<typeof autoPickSkills>[0]> = {},
) => autoPickSkills({ prompt, projectText: "app", skills, cap: 3, askModel, ...extra });

describe("autoPickSkills", () => {
  it("uses the model's picks and sends it a capped shortlist", async () => {
    let seen: ModelRequest | undefined;
    const outcome = await run(async (request) => {
      seen = request;
      return { picks: [{ name: "review-diff", reason: "check the change" }], modelUsed: true };
    });
    expect(outcome).toEqual({
      kind: "picked",
      picks: [{ name: "review-diff", reason: "check the change" }],
      by: "model",
    });
    expect(seen!.candidates.length).toBeLessThanOrEqual(SHORTLIST_SIZE);
    expect(seen!.candidates.every((c) => c.description.length <= 240)).toBe(true);
    expect(seen).toMatchObject({ request: prompt, project: "app", max: 3 });
  });

  it("takes the chips out of the request and counts them against the cap", async () => {
    let seen: ModelRequest | undefined;
    await run(
      async (request) => {
        seen = request;
        return { picks: [], modelUsed: true };
      },
      { prompt: `$tdd $teach ${prompt}` },
    );
    expect(seen!.request).toBe(prompt);
    expect(seen!.alreadyAdded).toEqual(["tdd", "teach"]);
    expect(seen!.max).toBe(1);
    expect(seen!.candidates.map((c) => c.name)).not.toContain("tdd");
  });

  it("says none when the model says none", async () => {
    const outcome = await run(async () => ({ picks: [], modelUsed: true }));
    expect(outcome).toMatchObject({ kind: "none", by: "model" });
    expect(outcome.kind === "none" && outcome.checked).toBeGreaterThan(0);
  });

  it("describes who picked, in words a user knows", () => {
    expect(describeEngine("openrouter", "openrouter/free")).toBe("OpenRouter free model");
    expect(describeEngine("openrouter", "google/gemma-4-31b-it:free")).toBe(
      "OpenRouter free model",
    );
    expect(describeEngine("openrouter", "anthropic/claude-haiku")).toBe("OpenRouter");
    expect(describeEngine("groq", "qwen/qwen3.8-27b")).toBe("Groq");
    expect(describeEngine("local", "gemma")).toBe("your local model");
    expect(describeEngine("chat", "gpt-6-luna")).toContain("uses your plan");
    expect(describeEngine(undefined, undefined)).toBeNull();
  });

  it("does not call the model when the draft is full", async () => {
    let calls = 0;
    const outcome = await run(
      async () => {
        calls += 1;
        return null;
      },
      { prompt: `$tdd $teach $grilling ${prompt}` },
    );
    expect(outcome).toEqual({ kind: "full", cap: 3 });
    expect(calls).toBe(0);
  });

  it.each([
    ["is unavailable", async () => ({ picks: [], modelUsed: false })],
    ["returns nothing", async () => null],
    [
      "throws",
      async () => {
        throw new Error("offline");
      },
    ],
  ])("falls back to the keyword pick when the model %s", async (_label, askModel) => {
    const outcome = await run(askModel);
    expect(outcome.kind).toBe("picked");
    if (outcome.kind === "picked") expect(outcome.by).toBe("keyword");
  });

  it("uses the keyword pick when there is no model at all", async () => {
    expect((await run(undefined)).kind).toBe("picked");
  });

  it("asks for nothing when no skill shares a word with the draft", async () => {
    let calls = 0;
    const outcome = await run(
      async () => {
        calls += 1;
        return null;
      },
      { prompt: "zzzz qqqq" },
    );
    expect(outcome).toEqual({ kind: "none", by: "keyword", checked: 0 });
    expect(calls).toBe(0);
  });
});

describe("describePicks", () => {
  it("joins the picks and drops empty reasons", () => {
    expect(
      describePicks([
        { name: "tdd", reason: "test first" },
        { name: "teach", reason: "" },
      ]),
    ).toBe("$tdd (test first), $teach");
  });
});
