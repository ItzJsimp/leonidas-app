import { describe, expect, it } from "vite-plus/test";

import { buildAgentDraftPrompt, sanitizeAgentDraft } from "./agentDraft.ts";

const TOOLS = ["Read", "Grep", "Glob", "Bash", "WebSearch"];

describe("buildAgentDraftPrompt", () => {
  it("names the agent, the request, the allowed tools and the data rule", () => {
    const { prompt } = buildAgentDraftPrompt({
      name: "test-scout",
      request: "Finds files for a task and reports their paths.",
      tools: TOOLS,
    });
    expect(prompt).toContain('Name: "test-scout"');
    expect(prompt).toContain("Finds files for a task");
    expect(prompt).toContain("Read, Grep, Glob, Bash, WebSearch");
    expect(prompt).toMatch(/data/i);
    expect(prompt).not.toContain("Current draft");
  });

  it("includes the current draft so a revision keeps what the user liked", () => {
    const { prompt } = buildAgentDraftPrompt({
      name: "test-scout",
      request: "Make it shorter.",
      currentDraft: { description: "Finds files.", instructions: "Look. Report.", tools: ["Read"] },
      tools: TOOLS,
    });
    expect(prompt).toContain("Current draft");
    expect(prompt).toContain("Look. Report.");
  });
});

describe("sanitizeAgentDraft", () => {
  const raw = {
    description: "  Finds   files\nfor a task.  ",
    instructions: "You are test-scout.\n\nReport paths.",
    tools: ["Read", "grep", "Teleport", "Read", "Bash"],
    never: ["Edit files.", "  ", "Edit files."],
  };

  it("keeps only allowed tools once each, in the allowed spelling", () => {
    expect(sanitizeAgentDraft(raw, { tools: TOOLS }).tools).toEqual(["Read", "Grep", "Bash"]);
  });

  it("puts the description on one line and drops empty or repeated rules", () => {
    const draft = sanitizeAgentDraft(raw, { tools: TOOLS });
    expect(draft.description).toBe("Finds files for a task.");
    expect(draft.never).toEqual(["Edit files."]);
    expect(draft.instructions).toBe("You are test-scout.\n\nReport paths.");
  });

  it("cuts long text to the limits", () => {
    const draft = sanitizeAgentDraft(
      {
        description: "d".repeat(900),
        instructions: "i".repeat(20_000),
        tools: [],
        never: Array.from({ length: 30 }, (_, index) => `Rule ${index}.`),
      },
      { tools: TOOLS },
    );
    expect(draft.description.length).toBeLessThanOrEqual(400);
    expect(draft.instructions.length).toBeLessThanOrEqual(8_000);
    expect(draft.never.length).toBeLessThanOrEqual(8);
  });
});
