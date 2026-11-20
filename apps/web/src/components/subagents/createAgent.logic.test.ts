import { describe, expect, it } from "vite-plus/test";

import {
  ADVANCED_FIELDS,
  basicsProblem,
  CREATE_STEPS,
  DEFAULT_CREATOR_MODEL,
  draftInput,
  previewDraft,
} from "./createAgent.logic";

describe("createAgent logic", () => {
  it("decision 5: step 1 asks for the name, the avatar and the model, then step 2 is the chat", () => {
    expect(CREATE_STEPS.map((step) => step.id)).toEqual(["basics", "chat"]);
    expect(CREATE_STEPS[0].fields).toEqual(["name", "avatar", "model"]);
  });

  it("decision 5: the model is a step 1 field, and Advanced holds effort, tools and skills", () => {
    expect(ADVANCED_FIELDS).toEqual(["effort", "tools", "skills", "canSpawn", "maxTurns"]);
    expect((ADVANCED_FIELDS as readonly string[]).includes("model")).toBe(false);
  });

  it("decision 5: step 1 needs a usable name that is free, and a model", () => {
    const taken = new Set(["scout"]);
    const model = "claude-haiku-5-5";
    expect(basicsProblem({ nameText: "  ", model, takenNames: taken })).toMatch(/name/u);
    expect(basicsProblem({ nameText: "Scout", model, takenNames: taken })).toMatch(/scout exists/u);
    expect(basicsProblem({ nameText: "my scout", model: " ", takenNames: taken })).toMatch(
      /model/u,
    );
    expect(basicsProblem({ nameText: "my scout", model, takenNames: taken })).toBeNull();
  });

  it("decision 5: the draft runs on the free creator model, not on the agent's model", () => {
    const first = draftInput({
      name: "my-scout",
      avatar: "felt/scout",
      model: " claude-opus-5-5 ",
      request: " Find files. ",
      currentDraft: null,
      confirmed: false,
    });
    expect(DEFAULT_CREATOR_MODEL).toBe("claude-haiku-5-5");
    expect(first).toEqual({
      name: "my-scout",
      avatar: "felt/scout",
      model: "claude-opus-5-5",
      creatorModel: "claude-haiku-5-5",
      request: "Find files.",
    });
    const revision = draftInput({
      name: "my-scout",
      avatar: "felt/scout",
      model: "claude-opus-5-5",
      request: "Shorter.",
      currentDraft: "---\nname: my-scout\n---\n",
      confirmed: true,
    });
    expect(revision.currentDraft).toBe("---\nname: my-scout\n---\n");
    expect(revision.confirmed).toBe(true);
  });

  it("shows the job, the tools and the instructions of a draft", () => {
    const text = [
      "---",
      "name: my-scout",
      'description: "Reads \\"docs\\": all of them."',
      "model: claude-haiku-5-5",
      "tools: [Read, Grep]",
      "---",
      "",
      "You are my-scout.",
      "",
    ].join("\n");
    expect(previewDraft(text)).toEqual({
      description: 'Reads "docs": all of them.',
      tools: ["Read", "Grep"],
      instructions: "You are my-scout.",
    });
    expect(previewDraft("just words")).toEqual({ description: "", tools: [], instructions: "" });
  });
});
