import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  isProviderUsageWindowExhausted,
  selectProviderFailoverTargets,
} from "./providerFailover.ts";

const current = { instanceId: ProviderInstanceId.make("claudeAgent"), model: "claude-sonnet" };
const source = (overrides: Partial<ServerProvider> = {}) =>
  provider("claudeAgent", { driver: ProviderDriverKind.make("claudeAgent"), ...overrides });

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
const targets = (providers: ServerProvider[], supportsHandoff = true, nowMs?: number) =>
  selectProviderFailoverTargets({
    providers: [source(), ...providers],
    current,
    supportsHandoff,
    ...(nowMs === undefined ? {} : { nowMs }),
  });

describe("selectProviderFailoverTargets", () => {
  it("offers a ready alternate subscription with its default model", () => {
    expect(targets([provider()])).toEqual([
      {
        label: "Codex",
        modelSelection: {
          instanceId: "codex",
          model: "gpt-test",
          options: [{ id: "effort", value: "medium" }],
        },
      },
    ]);
  });

  it("falls back to the first model when none is marked default", () => {
    const [target] = targets([
      provider("codex", {
        models: [
          { slug: "first", name: "First", isCustom: false, isDefault: false, capabilities: {} },
        ],
      }),
    ]);
    expect(target?.modelSelection.model).toBe("first");
  });

  it("resumes Claude on Sonnet 5.5 at medium effort, not the catalog default", () => {
    const [target] = targets([
      provider("claude_second", {
        driver: ProviderDriverKind.make("claudeAgent"),
        models: [
          {
            slug: "claude-fable-5-1",
            name: "Fable 5.1",
            isCustom: false,
            isDefault: true,
            capabilities: {},
          },
          {
            slug: "claude-sonnet-5-5",
            name: "Sonnet 5.5",
            isCustom: false,
            isDefault: false,
            capabilities: {},
          },
        ],
      }),
    ]);
    expect(target?.modelSelection).toEqual({
      instanceId: "claude_second",
      model: "claude-sonnet-5-5",
      options: [{ id: "effort", value: "medium" }],
    });
  });

  it("resumes Antigravity on Gemini 3.8 Flash at medium effort, with legacy fallback", () => {
    const [grouped] = targets([
      provider("antigravity", {
        driver: ProviderDriverKind.make("antigravity"),
        models: [
          {
            slug: "gemini-2.5-flash",
            name: "Flash 2.5",
            isCustom: false,
            isDefault: true,
            capabilities: {},
          },
          {
            slug: "gemini-3.8-flash",
            name: "Gemini 3.8 Flash",
            isCustom: false,
            isDefault: false,
            capabilities: {},
          },
        ],
      }),
    ]);
    expect(grouped?.modelSelection).toEqual({
      instanceId: "antigravity",
      model: "gemini-3.8-flash",
      options: [{ id: "effort", value: "medium" }],
    });

    const [legacy] = targets([
      provider("antigravity_legacy", {
        driver: ProviderDriverKind.make("antigravity"),
        models: [
          {
            slug: "gemini-2.5-flash",
            name: "Flash 2.5",
            isCustom: false,
            isDefault: true,
            capabilities: {},
          },
          {
            slug: "gemini-3.8-flash-medium",
            name: "Gemini 3.8 Flash Medium",
            isCustom: false,
            isDefault: false,
            capabilities: {},
          },
        ],
      }),
    ]);
    expect(legacy?.modelSelection).toEqual({
      instanceId: "antigravity_legacy",
      model: "gemini-3.8-flash-medium",
      options: [{ id: "effort", value: "medium" }],
    });
  });

  it("skips the current, disabled, unavailable, uninstalled, unready and paid providers", () => {
    expect(
      targets([
        provider("disabled", { enabled: false }),
        provider("unavailable", { availability: "unavailable" }),
        provider("missing", { installed: false }),
        provider("unready", { status: "error" }),
        provider("empty", { models: [] }),
        provider("paid", { driver: ProviderDriverKind.make("openrouter") }),
      ]),
    ).toEqual([]);
    expect(targets([provider()], false)).toEqual([]);
  });

  it("skips an instance sharing continuation group, email, or credentialFingerprint", () => {
    expect(
      selectProviderFailoverTargets({
        providers: [
          source({
            continuation: { groupKey: "shared" },
            auth: { status: "authenticated", email: "user@example.com" },
            usageLimits: {
              checkedAt: "2026-10-10T00:00:00.000Z",
              credentialFingerprint: "fp-123",
              windows: [],
            },
          }),
          provider("same-continuation", { continuation: { groupKey: "shared" } }),
          provider("same-email", {
            driver: ProviderDriverKind.make("claudeAgent"),
            auth: { status: "authenticated", email: "USER@EXAMPLE.COM" },
          }),
          provider("same-fingerprint", {
            usageLimits: {
              checkedAt: "2026-10-10T00:00:00.000Z",
              credentialFingerprint: "fp-123",
              windows: [],
            },
          }),
        ],
        current,
        supportsHandoff: true,
      }),
    ).toEqual([]);
  });

  it("skips an exhausted quota window unless its reset time has passed", () => {
    const quotaFuture = {
      checkedAt: "2026-10-10T00:00:00.000Z",
      windows: [
        {
          id: "five_hour",
          kind: "session" as const,
          label: "Five hour",
          usedPercent: 100,
          resetsAt: "2026-10-11T12:00:00.000Z",
        },
      ],
    };
    const quotaPast = {
      checkedAt: "2026-10-10T00:00:00.000Z",
      windows: [
        {
          id: "five_hour",
          kind: "session" as const,
          label: "Five hour",
          usedPercent: 100,
          resetsAt: "2026-10-11T08:00:00.000Z",
        },
      ],
    };

    const now = Date.parse("2026-10-11T10:00:00.000Z");

    // quotaFuture reset is at 12:00 (in the future) -> exhausted -> skipped
    expect(targets([provider("exhausted", { usageLimits: quotaFuture })], true, now)).toEqual([]);

    // quotaPast reset was at 08:00 (in the past) -> reset has arrived -> offered
    const offered = targets([provider("reset-available", { usageLimits: quotaPast })], true, now);
    expect(offered.length).toBe(1);
    expect(offered[0]?.modelSelection.instanceId).toBe("reset-available");
  });

  it("lists the other driver before another instance of the same driver", () => {
    const labels = targets([
      provider("claude_second", { driver: ProviderDriverKind.make("claudeAgent") }),
      provider("codex"),
    ]).map((target) => target.modelSelection.instanceId);
    expect(labels).toEqual(["codex", "claude_second"]);
  });
});
