import {
  ProviderDriverKind,
  type ModelCapabilities,
  type ServerProviderModel,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { getComposerProviderState, withDefaultReasoningEffort } from "./composerProviderState";

const caps = {
  optionDescriptors: [
    {
      id: "effort",
      label: "Effort",
      type: "select",
      options: [
        { id: "low", label: "Low" },
        { id: "high", label: "High", isDefault: true },
      ],
    },
  ],
} as unknown as ModelCapabilities;

describe("withDefaultReasoningEffort", () => {
  it("leaves the model alone when no default is set", () => {
    expect(withDefaultReasoningEffort(caps, undefined, null)).toBeUndefined();
  });

  it("starts an unpicked model on the default level", () => {
    expect(withDefaultReasoningEffort(caps, undefined, "low")).toEqual([
      { id: "effort", value: "low" },
    ]);
  });

  it("keeps an explicit pick and skips levels the model lacks", () => {
    const picked = [{ id: "effort", value: "high" }];
    expect(withDefaultReasoningEffort(caps, picked, "low")).toBe(picked);
    expect(withDefaultReasoningEffort(caps, undefined, "medium")).toBeUndefined();
  });
});

describe("getComposerProviderState speedIcon", () => {
  const claude = ProviderDriverKind.make("claudeAgent");
  const models = [
    {
      slug: "opus-fast",
      name: "Opus",
      isCustom: false,
      capabilities: {
        optionDescriptors: [{ id: "fastMode", label: "Fast mode", type: "boolean" }],
      },
    },
  ] as unknown as ReadonlyArray<ServerProviderModel>;
  const state = (modelOptions: Parameters<typeof getComposerProviderState>[0]["modelOptions"]) =>
    getComposerProviderState({
      provider: claude,
      model: "opus-fast",
      models,
      modelOptions,
      planModeEnabled: true,
    });

  it("is set while fast mode is on", () => {
    expect(state([{ id: "fastMode", value: true }]).speedIcon).toBe("fast");
  });

  it("is left out while fast mode is off or not chosen", () => {
    expect(state([{ id: "fastMode", value: false }])).not.toHaveProperty("speedIcon");
    expect(state(undefined)).not.toHaveProperty("speedIcon");
  });
});
