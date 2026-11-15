import { describe, expect, it, vi } from "vite-plus/test";
import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";
import { deriveProviderInstanceEntries } from "../../providerInstances";
import {
  continueWithProvider,
  createTargetForModel,
  getProviderFailoverTargets,
  isProviderUsageWindowExhausted,
} from "./providerFailover";

const current = { instanceId: ProviderInstanceId.make("current_instance"), model: "gpt-6.1-sol" };

function provider(id = "codex", overrides: Partial<ServerProvider> = {}): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(id),
    driver: ProviderDriverKind.make("codex"),
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-10-10T00:00:00.000Z",
    slashCommands: [],
    skills: [],
    models: [
      { slug: "gpt-test", name: "Test model", isCustom: false, isDefault: true, capabilities: {} },
    ],
    ...overrides,
  };
}

const targets = (
  providers: ServerProvider[],
  supportsHandoff = true,
  currentSelection = current,
  sources?: any,
  nowMs?: number,
) =>
  getProviderFailoverTargets({
    entries: deriveProviderInstanceEntries(providers),
    settings: DEFAULT_UNIFIED_SETTINGS,
    current: currentSelection,
    supportsHandoff,
    usageLimitSources: sources,
    nowMs: nowMs ?? Date.parse("2026-10-10T00:00:00.000Z"),
  });

describe("provider failover", () => {
  it("never offers failed or stale accounts even when their old status is ready", () => {
    expect(
      targets([
        provider("expired", { connectionIssue: "token_expired" }),
        provider("signed_out", { auth: { status: "unauthenticated" } }),
        provider("blocked", { connectionIssue: "network_blocked" }),
        provider("stale", { checkedAt: "2026-10-09T00:00:00Z" }),
      ]),
    ).toEqual([]);
  });
  it("offers other connected drivers from live capabilities without a subscription allowlist", () => {
    expect(
      targets([
        provider("custom", {
          driver: ProviderDriverKind.make("custom"),
          supportsTextGeneration: true,
        }),
      ]).map((target) => target.instanceId),
    ).toEqual(["custom"]);
  });
  it("offers a ready alternate subscription with its catalog default and medium effort", () => {
    expect(targets([provider()])).toEqual([
      {
        instanceId: "codex",
        driverKind: "codex",
        label: "Codex",
        modelSelection: {
          instanceId: "codex",
          model: "gpt-test",
          options: [{ id: "effort", value: "medium" }],
        },
        availableModels: [{ slug: "gpt-test", name: "Test model", isDefault: true }],
      },
    ]);
  });

  it("selects Sonnet 5.5 on medium effort for Claude instead of Fable 5.1", () => {
    const claude = provider("claude_jake", {
      driver: ProviderDriverKind.make("claudeAgent"),
      displayName: "Claude (Jake)",
      models: [
        {
          slug: "claude-fable-5-1",
          name: "Claude Fable 5.1",
          isCustom: false,
          isDefault: true,
          capabilities: {},
        },
        { slug: "claude-opus-5-5", name: "Claude Opus 5.5", isCustom: false, capabilities: {} },
        { slug: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", isCustom: false, capabilities: {} },
        { slug: "claude-haiku-5-5", name: "Claude Haiku 5.5", isCustom: false, capabilities: {} },
      ],
    });
    const result = targets([claude]);
    expect(result).toHaveLength(1);
    expect(result[0]!.label).toBe("Claude (Jake)");
    expect(result[0]!.modelSelection).toEqual({
      instanceId: "claude_jake",
      model: "claude-sonnet-5-5",
      options: [{ id: "effort", value: "medium" }],
    });
    expect(result[0]!.availableModels.map((m) => m.slug)).toEqual([
      "claude-fable-5-1",
      "claude-opus-5-5",
      "claude-sonnet-5-5",
      "claude-haiku-5-5",
    ]);
  });

  it("selects GPT-6.1 Sol on medium effort for ChatGPT/Codex", () => {
    const codex = provider("codex_work", {
      driver: ProviderDriverKind.make("codex"),
      displayName: "ChatGPT Work",
      models: [
        {
          slug: "gpt-6-astra",
          name: "GPT-6 Astra",
          isCustom: false,
          isDefault: true,
          capabilities: {},
        },
        { slug: "gpt-6.1-sol", name: "GPT-6.1 Sol", isCustom: false, capabilities: {} },
        { slug: "gpt-6-luna", name: "GPT-6 Luna", isCustom: false, capabilities: {} },
      ],
    });
    const result = targets([codex]);
    expect(result).toHaveLength(1);
    expect(result[0]!.modelSelection).toEqual({
      instanceId: "codex_work",
      model: "gpt-6.1-sol",
      options: [{ id: "effort", value: "medium" }],
    });
  });

  it("selects Gemini 3.8 flash on medium effort for Antigravity, with legacy fallback", () => {
    const antigravity = provider("antigravity_account", {
      driver: ProviderDriverKind.make("antigravity"),
      displayName: "Antigravity",
      models: [
        {
          slug: "gemini-3.8-flash",
          name: "Gemini 3.8 Flash",
          isCustom: false,
          isDefault: true,
          aliases: ["gemini-3.8-flash-medium", "gemini-3.8-flash-high"],
          capabilities: {},
        },
        {
          slug: "gemini-3.1-pro",
          name: "Gemini 3.1 Pro",
          isCustom: false,
          capabilities: {},
        },
      ],
    });
    const result = targets([antigravity]);
    expect(result).toHaveLength(1);
    expect(result[0]!.modelSelection).toEqual({
      instanceId: "antigravity_account",
      model: "gemini-3.8-flash",
      options: [{ id: "effort", value: "medium" }],
    });

    const legacy = provider("antigravity_legacy", {
      driver: ProviderDriverKind.make("antigravity"),
      displayName: "Antigravity Legacy",
      models: [
        {
          slug: "gemini-3.8-flash-high",
          name: "Gemini 3.8 Flash (High)",
          isCustom: false,
          capabilities: {},
        },
        {
          slug: "gemini-3.8-flash-medium",
          name: "Gemini 3.8 Flash (Medium)",
          isCustom: false,
          isDefault: true,
          capabilities: {},
        },
      ],
    });
    const legacyResult = targets([legacy]);
    expect(legacyResult).toHaveLength(1);
    expect(legacyResult[0]!.modelSelection).toEqual({
      instanceId: "antigravity_legacy",
      model: "gemini-3.8-flash-medium",
      options: [{ id: "effort", value: "medium" }],
    });
  });

  it("does not offer the current, disabled, unavailable, uninstalled or unready provider", () => {
    expect(
      targets([
        provider("current_instance", { driver: ProviderDriverKind.make("codex") }),
        provider("disabled", { enabled: false }),
        provider("unavailable", { availability: "unavailable" }),
        provider("missing", { installed: false }),
        provider("unready", { status: "error" }),
        provider("empty", { models: [] }),
        provider("paid", {
          driver: ProviderDriverKind.make("openrouter"),
          auth: { status: "unauthenticated" },
        }),
      ]),
    ).toEqual([]);
    expect(targets([provider()], false)).toEqual([]);
  });

  it("excludes another instance sharing the limited account by continuationKey or email", () => {
    const currentClaude = {
      instanceId: ProviderInstanceId.make("claude_a"),
      model: "claude-sonnet-5-5",
    };
    expect(
      targets(
        [
          provider("claude_a", {
            driver: ProviderDriverKind.make("claudeAgent"),
            continuation: { groupKey: "shared" },
            auth: { status: "authenticated", email: "jake@example.com" },
          }),
          provider("same_key", {
            driver: ProviderDriverKind.make("claudeAgent"),
            continuation: { groupKey: "shared" },
          }),
          provider("same_email", {
            driver: ProviderDriverKind.make("claudeAgent"),
            auth: { status: "authenticated", email: "jake@example.com" },
          }),
        ],
        true,
        currentClaude,
      ),
    ).toEqual([]);
  });

  it("excludes instances with exhausted session or weekly rate limits", () => {
    const nowMs = 1770000000000;
    const futureReset = new Date(nowMs + 3600000).toISOString();
    const pastReset = new Date(nowMs - 3600000).toISOString();

    const sessionLimited = provider("session_limited", {
      usageLimits: {
        checkedAt: "2026-10-10T00:00:00.000Z",
        windows: [
          {
            id: "five_hour",
            kind: "session",
            label: "Session",
            usedPercent: 100,
            resetsAt: futureReset,
          },
        ],
      },
    });

    const weeklyLimited = provider("weekly_limited", {
      usageLimits: {
        checkedAt: "2026-10-10T00:00:00.000Z",
        windows: [
          {
            id: "seven_day",
            kind: "weekly",
            label: "Weekly",
            usedPercent: 100,
            resetsAt: futureReset,
          },
        ],
      },
    });

    const messageLimited = provider("message_limited", {
      message: "Claude usage limit reached. Try again later.",
    });

    const expiredReset = provider("expired_reset", {
      usageLimits: {
        checkedAt: "2026-10-10T00:00:00.000Z",
        windows: [
          {
            id: "five_hour",
            kind: "session",
            label: "Session",
            usedPercent: 100,
            resetsAt: pastReset,
          },
        ],
      },
    });

    expect(
      targets([sessionLimited, weeklyLimited, messageLimited], true, current, undefined, nowMs),
    ).toEqual([]);

    // The expired reset window is allowed
    const valid = targets([expiredReset], true, current, undefined, nowMs);
    expect(valid).toHaveLength(1);
    expect(valid[0]!.instanceId).toBe("expired_reset");
  });

  it("checks hub usageLimitSources for exhausted windows", () => {
    const nowMs = 1770000000000;
    const futureReset = new Date(nowMs + 3600000).toISOString();
    const claudeInstance = provider("claude_sub", {
      driver: ProviderDriverKind.make("claudeAgent"),
      auth: { status: "authenticated", email: "work@corp.com" },
    });

    const sources = [
      {
        id: "hub",
        label: "Hub",
        accounts: [
          {
            id: "acc_1",
            driver: "claudeAgent",
            email: "work@corp.com",
            usageLimits: {
              checkedAt: "2026-10-10T00:00:00.000Z",
              windows: [
                {
                  id: "seven_day",
                  kind: "weekly" as const,
                  label: "Weekly",
                  usedPercent: 100,
                  resetsAt: futureReset,
                },
              ],
            },
          },
        ],
      },
    ];

    expect(targets([claudeInstance], true, current, sources, nowMs)).toEqual([]);
  });

  it("createTargetForModel allows selecting a specific model with medium effort", () => {
    const [target] = targets([provider()]);
    expect(target).toBeDefined();
    const updated = createTargetForModel(target!, "gpt-custom-model");
    expect(updated.modelSelection).toEqual({
      instanceId: "codex",
      model: "gpt-custom-model",
      options: [{ id: "effort", value: "medium" }],
    });
  });

  it("isProviderUsageWindowExhausted correctly checks percent and reset times", () => {
    const now = 1000000;
    expect(
      isProviderUsageWindowExhausted(
        { id: "1", kind: "session", label: "s", usedPercent: 50 },
        now,
      ),
    ).toBe(false);
    expect(
      isProviderUsageWindowExhausted(
        { id: "1", kind: "session", label: "s", usedPercent: 100 },
        now,
      ),
    ).toBe(true);
    expect(
      isProviderUsageWindowExhausted(
        { id: "1", kind: "session", label: "s", usedPercent: 99.6 },
        now,
      ),
    ).toBe(true);
    expect(
      isProviderUsageWindowExhausted(
        {
          id: "1",
          kind: "session",
          label: "s",
          usedPercent: 100,
          resetsAt: new Date(now + 10000).toISOString(),
        },
        now,
      ),
    ).toBe(true);
    expect(
      isProviderUsageWindowExhausted(
        {
          id: "1",
          kind: "session",
          label: "s",
          usedPercent: 100,
          resetsAt: new Date(now - 10000).toISOString(),
        },
        now,
      ),
    ).toBe(false);
  });

  it("continueWithProvider allows chosen model from availableModels", async () => {
    const continueWith = vi.fn().mockResolvedValue(undefined);
    const claude = provider("claude_inst", {
      driver: ProviderDriverKind.make("claudeAgent"),
      models: [
        {
          slug: "claude-sonnet-5-5",
          name: "Sonnet 5.5",
          isCustom: false,
          isDefault: true,
          capabilities: {},
        },
        { slug: "claude-opus-5-5", name: "Opus 5.5", isCustom: false, capabilities: {} },
      ],
    });
    const [target] = targets([claude]);
    expect(target).toBeDefined();

    // Specific model choice
    const opusTarget = createTargetForModel(target!, "claude-opus-5-5");
    await continueWithProvider({
      pending: { current: false },
      targets: [target!],
      target: opusTarget,
      continueWith,
    });
    expect(continueWith).toHaveBeenCalledWith(opusTarget);
  });
});
