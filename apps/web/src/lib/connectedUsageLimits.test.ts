import { describe, expect, it } from "vite-plus/test";
import {
  UsageLimitSourceId,
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import type { LimitPresentations } from "@t3tools/shared/usageLimits";
import { activeAccountIds, collectConnectedUsageLimits } from "./connectedUsageLimits";

const now = Date.parse("2026-10-10T10:00:00Z");
const provider = (id: string, driver: string, email: string, used: number): ServerProvider => ({
  instanceId: ProviderInstanceId.make(id),
  driver: ProviderDriverKind.make(driver),
  enabled: true,
  installed: true,
  version: null,
  status: "ready",
  models: [],
  slashCommands: [],
  skills: [],
  auth: { status: "authenticated", email },
  checkedAt: new Date(now).toISOString(),
  usageLimits: {
    checkedAt: new Date(now).toISOString(),
    windows: [{ id: "session", kind: "session", label: "Session", usedPercent: used }],
  },
});
const presentations = (...groups: ServerProvider[][]): LimitPresentations =>
  new Map(
    groups.map((providers, index) => [
      EnvironmentId.make(`env-${index}`),
      { entry: { target: { label: `Host ${index}` } }, serverConfig: { providers } },
    ]),
  );

describe("connected usage accounts", () => {
  it("includes all drivers and distinct accounts without repeating one subscription across environments", () => {
    const a = provider("claude-a", "claude", "a@example.com", 20);
    const report = collectConnectedUsageLimits(
      presentations(
        [a, provider("codex", "codex", "b@example.com", 30)],
        [
          {
            ...a,
            auth: { status: "authenticated", email: "A@EXAMPLE.COM" },
            usageLimits: {
              checkedAt: new Date(now + 1000).toISOString(),
              windows: [{ id: "week", kind: "weekly", label: "Weekly", usedPercent: 75 }],
            },
          },
          provider("claude-b", "claude", "c@example.com", 40),
        ],
      ),
      now,
    );
    expect(report.accounts).toHaveLength(3);
    expect(
      report.accounts.find((account) => account.email === "A@EXAMPLE.COM")?.limits.windows[0]
        ?.usedPercent,
    ).toBe(75);
  });
  it("keeps connected unsupported accounts and excludes disabled or signed-out providers", () => {
    const base = provider("custom", "custom", "a@example.com", 0);
    const report = collectConnectedUsageLimits(
      presentations([
        { ...base, usageLimits: undefined },
        { ...base, instanceId: ProviderInstanceId.make("disabled"), enabled: false },
        {
          ...base,
          instanceId: ProviderInstanceId.make("signed-out"),
          auth: { status: "unauthenticated" },
        },
      ]),
      now,
    );
    expect(report.accounts).toHaveLength(1);
    expect(report.accounts[0]?.limits.unavailable?.reason).toBe("unsupported");
    expect(report.accounts[0]?.limits.windows).toEqual([]);
  });
  it("merges a hub account with its native account using the freshest limits and preserves source errors", () => {
    const p = provider("claude", "claude", "a@example.com", 10);
    const input = new Map(presentations([p]));
    const env = EnvironmentId.make("hub");
    input.set(env, {
      entry: { target: { label: "Hub" } },
      serverConfig: {
        providers: [],
        usageLimitSources: [
          {
            id: UsageLimitSourceId.make("proxy"),
            kind: "cliproxy",
            label: "Proxy",
            checkedAt: new Date(now).toISOString(),
            error: "Refresh failed",
            accounts: [
              {
                id: "a",
                driver: p.driver,
                email: "a@example.com",
                usageLimits: {
                  checkedAt: new Date(now + 1000).toISOString(),
                  windows: [{ id: "week", label: "Weekly", kind: "weekly", usedPercent: 95 }],
                },
              },
            ],
          },
        ],
      },
    });
    const report = collectConnectedUsageLimits(input, now);
    expect(report.accounts).toHaveLength(1);
    expect(report.accounts[0]?.instanceId).toBe(p.instanceId);
    expect(report.accounts[0]?.limits.windows[0]?.usedPercent).toBe(95);
    expect(report.notices).toEqual(["Proxy: Refresh failed"]);
  });

  it("finds this thread's account by email, then credential, then instance", () => {
    const a = provider("claude-a", "claude", "A@example.com", 20);
    const b = provider("claude-b", "claude", "b@example.com", 30);
    const { accounts } = collectConnectedUsageLimits(presentations([a, b]), now);
    const byEmail = activeAccountIds(accounts, {
      id: "env-0:claude-a",
      driver: "claude",
      email: "a@example.com ",
    });
    expect([...byEmail]).toEqual(["env-0:claude-a"]);
    expect([...activeAccountIds(accounts, { id: "env-0:claude-b", driver: "claude" })]).toEqual([
      "env-0:claude-b",
    ]);
    expect(
      activeAccountIds(accounts, { id: "env-0:claude-a", driver: "codex", email: "a@example.com" })
        .size,
    ).toBe(0);
    expect(activeAccountIds(accounts, null).size).toBe(0);
  });
});
