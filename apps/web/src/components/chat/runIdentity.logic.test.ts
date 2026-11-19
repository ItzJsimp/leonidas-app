import type { ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveRunIdentity } from "./runIdentity.logic";

const claudeJake = {
  instanceId: "claude_jake",
  driver: "claudeAgent",
  displayName: "Jake",
  accentColor: "#ff8800",
  models: [
    {
      slug: "claude-sonnet-5-5",
      name: "Claude Sonnet 5.5",
      shortName: "Sonnet 5.5",
      isCustom: false,
      capabilities: {
        optionDescriptors: [
          {
            id: "effort",
            label: "Effort",
            type: "select",
            options: [
              { id: "medium", label: "Medium" },
              { id: "xhigh", label: "Extra High" },
            ],
          },
        ],
      },
    },
  ],
} as unknown as ServerProvider;

const antigravity = {
  instanceId: "antigravity",
  driver: "antigravity",
  displayName: "Antigravity",
  models: [
    {
      slug: "gemini-4-argon",
      name: "Gemini 4 Argon",
      aliases: ["gemini-4-argon-high", "gemini-4-argon-medium"],
      isCustom: false,
      capabilities: {
        optionDescriptors: [
          {
            id: "effort",
            label: "Reasoning",
            type: "select",
            options: [
              { id: "medium", label: "Medium", isDefault: true },
              { id: "high", label: "High" },
            ],
            currentValue: "medium",
          },
        ],
      },
    },
  ],
} as unknown as ServerProvider;

const selection = (options: ReadonlyArray<{ id: string; value: string | boolean }>) =>
  ({ instanceId: "claude_jake", model: "claude-sonnet-5-5", options }) as never;

describe("resolveRunIdentity", () => {
  it("names the model, effort label and account that ran", () => {
    const identity = resolveRunIdentity(
      {
        providerInstanceId: "claude_jake",
        modelSelection: selection([{ id: "effort", value: "xhigh" }]),
      },
      [claudeJake],
    );
    expect(identity.modelLabel).toBe("Sonnet 5.5");
    expect(identity.effortLabel).toBe("Extra High");
    expect(identity.accountLabel).toBe("Jake");
    expect(identity.accentColor).toBe("#ff8800");
    expect(identity.fastMode).toBe(false);
  });

  it("falls back to raw values when the account was removed", () => {
    const identity = resolveRunIdentity(
      {
        providerInstanceId: "claude_gone",
        modelSelection: selection([
          { id: "effort", value: "medium" },
          { id: "fastMode", value: true },
        ]),
      },
      [claudeJake],
    );
    expect(identity.modelLabel).toBe("claude-sonnet-5-5");
    expect(identity.effortLabel).toBe("Medium");
    expect(identity.accountLabel).toBeUndefined();
    expect(identity.fastMode).toBe(true);
  });

  it("infers effort from legacy tiered Antigravity slugs when options were omitted", () => {
    const identity = resolveRunIdentity(
      {
        providerInstanceId: "antigravity",
        modelSelection: { instanceId: "antigravity", model: "gemini-4-argon-high" } as never,
      },
      [antigravity],
    );
    expect(identity.modelLabel).toBe("Gemini 4 Argon");
    expect(identity.effortLabel).toBe("High");
  });
});
