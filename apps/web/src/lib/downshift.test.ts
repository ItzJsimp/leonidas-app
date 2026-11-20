import type { ServerProviderModel } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { cheapModelsFor, isSmallTask, suggestDownshift, type DownshiftInput } from "./downshift";

const EFFORTS = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "xhigh", label: "Extra High" },
  { id: "max", label: "Max" },
];
const HAIKU = { slug: "claude-haiku-5-5", name: "Claude Haiku 5.5" };
const input = (over: Partial<DownshiftInput> = {}): DownshiftInput => ({
  prompt: "Fix the typo in the README heading",
  attachmentCount: 0,
  contextTokens: 3_000,
  currentEffortId: "xhigh",
  effortOptions: EFFORTS,
  cheapModels: [HAIKU],
  ...over,
});

describe("isSmallTask", () => {
  it.each([
    "Fix the typo in the README heading",
    "Rename the variable fooBar to barFoo in utils.ts",
    "Change the button color to blue",
    "Remove the unused import in App.tsx",
    "Fix the typo",
  ])("accepts a short, small edit: %s", (prompt) => {
    expect(isSmallTask(prompt, 0)).toBe(true);
  });

  it.each([
    "Refactor the auth module and fix the typo in the header",
    "Investigate why the build fails",
    "Implement a new settings page with a color picker",
    "Add tests for the rename helper",
    "hi",
  ])("rejects a large, vague or tiny ask: %s", (prompt) => {
    expect(isSmallTask(prompt, 0)).toBe(false);
  });

  it("rejects a prompt with attachments, a code block, or too many words", () => {
    expect(isSmallTask("Fix the typo in the README heading", 1)).toBe(false);
    expect(isSmallTask("Fix the typo in this: ```const a = 1```", 0)).toBe(false);
    expect(isSmallTask(`Fix the typo ${"word ".repeat(45)}`, 0)).toBe(false);
  });
});

describe("suggestDownshift", () => {
  it("drops a heavy effort to low on the same model first", () => {
    expect(suggestDownshift(input())).toEqual({ kind: "effort", optionId: "low", label: "Low" });
  });

  it("falls back to medium when the model has no low level", () => {
    const options = EFFORTS.filter((option) => option.id !== "low");
    expect(suggestDownshift(input({ effortOptions: options }))).toEqual({
      kind: "effort",
      optionId: "medium",
      label: "Medium",
    });
  });

  it("suggests a cheaper model when the effort is already light", () => {
    expect(suggestDownshift(input({ currentEffortId: "medium" }))).toEqual({
      kind: "model",
      ...HAIKU,
    });
  });

  it("keeps the model of a long chat, because a switch drops its cache", () => {
    expect(
      suggestDownshift(input({ currentEffortId: "medium", contextTokens: 90_000 })),
    ).toBeNull();
  });

  it("says nothing for a large task or when nothing is cheaper", () => {
    expect(suggestDownshift(input({ prompt: "Refactor the whole auth module" }))).toBeNull();
    expect(suggestDownshift(input({ currentEffortId: "low", cheapModels: [] }))).toBeNull();
  });
});

describe("cheapModelsFor", () => {
  const model = (slug: string, aliases?: string[]) =>
    ({
      slug,
      name: slug,
      isCustom: false,
      capabilities: { optionDescriptors: [] },
      ...(aliases ? { aliases } : {}),
    }) satisfies ServerProviderModel;
  const models = [
    model("claude-opus-5-5"),
    model("claude-haiku-5-5"),
    model("gemini-4-neon", ["gemini-3.8-flash-low"]),
  ];

  it("lists the cheap-tier models, matching grouped aliases", () => {
    expect(cheapModelsFor(models, "claude-opus-5-5").map((m) => m.slug)).toEqual([
      "claude-haiku-5-5",
      "gemini-4-neon",
    ]);
  });

  it("lists none when the current model is already cheap", () => {
    expect(cheapModelsFor(models, "claude-haiku-5-5")).toEqual([]);
  });
});
