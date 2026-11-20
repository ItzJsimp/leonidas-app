import { describe, expect, it } from "vite-plus/test";

import type { SubagentCatalogEntry } from "@t3tools/contracts";

import {
  draftFromEntry,
  isEmptyPatch,
  knownFreeModels,
  maxTurnsProblem,
  parseToolList,
  patchFromDraft,
  raisesSpend,
  slugifySubagentName,
} from "./subagentEdit.logic";

const entry: SubagentCatalogEntry = {
  name: "explorer",
  description: "Finds things.",
  source: "aios",
  projectName: null,
  specPath: "/x/explorer.md",
  extends: null,
  enabled: true,
  model: "claude-haiku-5-5",
  account: null,
  tier: "free",
  tools: ["Read", "Grep"],
  never: [],
  context: [{ path: "DESIGN.md", tokens: 100 }],
  estimatedStartTokens: 9_000,
  legacy: false,
  error: null,
};

describe("patchFromDraft", () => {
  it("is empty when nothing changed", () => {
    expect(isEmptyPatch(patchFromDraft(entry, draftFromEntry(entry)))).toBe(true);
  });

  it("holds only the changed fields", () => {
    const draft = { ...draftFromEntry(entry), model: "claude-opus-5-5", tools: ["Read"] };
    expect(patchFromDraft(entry, draft)).toEqual({ model: "claude-opus-5-5", tools: ["Read"] });
  });

  it("clears a description and a model with null", () => {
    const draft = { ...draftFromEntry(entry), description: " ", model: "" };
    expect(patchFromDraft(entry, draft)).toEqual({ description: null, model: null });
  });
});

describe("raisesSpend", () => {
  const free = knownFreeModels([entry]);

  it("flags a move to a model that is not known free", () => {
    expect(raisesSpend({ model: "claude-opus-5-5" }, free)).toBe(true);
  });

  it("passes a free model, a cleared model and other edits", () => {
    expect(raisesSpend({ model: "claude-haiku-5-5" }, free)).toBe(false);
    expect(raisesSpend({ model: null }, free)).toBe(false);
    expect(raisesSpend({ tools: ["Read"] }, free)).toBe(false);
  });
});

describe("text helpers", () => {
  it("parses a tool list without duplicates", () => {
    expect(parseToolList("Read, Grep ,, Read\nGlob")).toEqual(["Read", "Grep", "Glob"]);
  });

  it("makes a subagent name from words", () => {
    expect(slugifySubagentName("  My New Helper!  ")).toBe("my-new-helper");
    expect(slugifySubagentName("!!!")).toBeNull();
  });
});

describe("the Agents tab fields", () => {
  const lead: SubagentCatalogEntry = {
    ...entry,
    avatar: "felt/team-lead",
    effort: "medium",
    skills: ["plan-slices"],
    canSpawn: true,
    maxTurns: 20,
    instructions: "Plan the task.",
  };

  it("reads the new keys into the draft", () => {
    expect(draftFromEntry(lead)).toMatchObject({
      avatar: "felt/team-lead",
      effort: "medium",
      skills: ["plan-slices"],
      canSpawn: true,
      maxTurns: "20",
      instructions: "Plan the task.",
    });
    expect(isEmptyPatch(patchFromDraft(lead, draftFromEntry(lead)))).toBe(true);
  });

  it("writes only the new keys that changed, and removes a cleared line with null", () => {
    const draft = {
      ...draftFromEntry(lead),
      avatar: "felt/reviewer",
      effort: "",
      skills: [],
      canSpawn: false,
      maxTurns: "5",
      instructions: "Plan carefully.",
    };
    expect(patchFromDraft(lead, draft)).toEqual({
      avatar: "felt/reviewer",
      effort: null,
      skills: [],
      canSpawn: null,
      maxTurns: 5,
      body: "Plan carefully.",
    });
  });

  it("turns the spawn switch on with true", () => {
    const draft = { ...draftFromEntry(entry), canSpawn: true };
    expect(patchFromDraft(entry, draft)).toEqual({ canSpawn: true });
  });

  it("rejects a turn limit that is not a whole number of 1 or more", () => {
    expect(maxTurnsProblem("")).toBeNull();
    expect(maxTurnsProblem("12")).toBeNull();
    expect(maxTurnsProblem("0")).not.toBeNull();
    expect(maxTurnsProblem("2.5")).not.toBeNull();
    expect(maxTurnsProblem("many")).not.toBeNull();
    const draft = { ...draftFromEntry(entry), maxTurns: "abc" };
    expect(patchFromDraft(entry, draft)).toEqual({});
  });
});
