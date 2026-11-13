import { ProviderDriverKind } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  connectedModelGroups,
  unconnectedModel,
  type ModelListProvider,
} from "./modelOptions.logic";

const claude: ModelListProvider = {
  driver: ProviderDriverKind.make("claudeAgent"),
  displayName: "Claude",
  enabled: true,
  installed: true,
  models: [
    { slug: "claude-opus-5-5", name: "Claude Opus 5.5" },
    { slug: "claude-haiku-5-5", name: "Claude Haiku 5.5" },
    { slug: "claude-old-1", name: "Claude Old", isLegacy: true },
  ],
};
const codex: ModelListProvider = {
  driver: ProviderDriverKind.make("codex"),
  enabled: true,
  installed: true,
  models: [{ slug: "gpt-6-luna", name: "GPT-6 Luna" }],
};

describe("connectedModelGroups", () => {
  it("lists each connected account with its current models", () => {
    expect(connectedModelGroups([claude, codex])).toEqual([
      {
        provider: "Claude",
        models: [
          { slug: "claude-opus-5-5", label: "Claude Opus 5.5" },
          { slug: "claude-haiku-5-5", label: "Claude Haiku 5.5" },
        ],
      },
      { provider: "Codex", models: [{ slug: "gpt-6-luna", label: "GPT-6 Luna" }] },
    ]);
  });

  it("leaves out accounts that are off, missing, unavailable or signed out", () => {
    const groups = connectedModelGroups([
      { ...claude, enabled: false },
      { ...codex, installed: false },
      { ...codex, availability: "unavailable" },
      { ...codex, connectionIssue: "signed_out" },
      { ...codex, connectionIssue: "cli_missing" },
    ]);
    expect(groups).toEqual([]);
  });

  it("keeps an account whose quota is reached", () => {
    expect(connectedModelGroups([{ ...codex, connectionIssue: "quota_reached" }])).toHaveLength(1);
  });

  it("shows a model once when two accounts offer it", () => {
    const groups = connectedModelGroups([claude, { ...claude, displayName: "Claude (work)" }]);
    expect(groups).toHaveLength(1);
  });
});

describe("unconnectedModel", () => {
  const groups = connectedModelGroups([claude]);

  it("is null for a model an account offers, and for no model", () => {
    expect(unconnectedModel(groups, "claude-opus-5-5")).toBeNull();
    expect(unconnectedModel(groups, "")).toBeNull();
    expect(unconnectedModel(groups, "  ")).toBeNull();
  });

  it("returns the model when no connected account offers it", () => {
    expect(unconnectedModel(groups, "gpt-6-luna")).toBe("gpt-6-luna");
  });
});
