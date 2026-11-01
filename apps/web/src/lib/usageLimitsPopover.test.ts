import type { ServerProviderUsageWindow, UsageLimitsReport } from "@t3tools/contracts";
import { ProviderDriverKind } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  accountFreshnessLabel,
  accountTitle,
  compactPercentNumber,
  compactWindowLabel,
  contextWindowFigures,
  contextWindowTokensForModel,
  expireElapsedWindow,
  extraWindowSummaries,
  formatResetCountdown,
  formatResetLabel,
  formatTokenCount,
  glanceLimitRows,
  groupAccountsByProvider,
  limitLabel,
  limitsFreshness,
  orderPlanWindows,
  parseContextWindowSize,
  percentText,
  shortPlanName,
  siblingAccountSummary,
  splitAccountHeader,
  usageSeverity,
  withKnownContextWindow,
} from "./usageLimitsPopover";

const window = (
  id: string,
  kind: ServerProviderUsageWindow["kind"],
  label: string,
): ServerProviderUsageWindow => ({ id, kind, label, usedPercent: 10 });

describe("usage limits popover helpers", () => {
  it("grades what is left: blue from 50%, amber under 50%, red under 10%", () => {
    expect(usageSeverity(50)).toBe("normal");
    expect(usageSeverity(50.1)).toBe("warning");
    expect(usageSeverity(90)).toBe("warning");
    expect(usageSeverity(90.1)).toBe("critical");
    expect(usageSeverity(100)).toBe("critical");
  });

  it("formats token counts like the Claude popover", () => {
    expect(formatTokenCount(950)).toBe("950");
    expect(formatTokenCount(76_400)).toBe("76.4k");
    expect(formatTokenCount(200_000)).toBe("200k");
    expect(formatTokenCount(999_990)).toBe("1M");
    expect(formatTokenCount(1_000_000)).toBe("1M");
    expect(formatTokenCount(1_500_000)).toBe("1.5M");
  });

  it("counts down inside a day and names the moment beyond it", () => {
    const now = Date.parse("2026-10-09T12:00:00Z");
    const at = (ms: number) => new Date(now + ms).toISOString();
    const formatAt = () => "Sun 9:00 PM";
    expect(formatResetLabel(undefined, now, formatAt)).toBeNull();
    expect(formatResetLabel(at(-1), now, formatAt)).toBe("Resets now");
    expect(formatResetLabel(at(30_000), now, formatAt)).toBe("Resets in 1 min");
    expect(formatResetLabel(at(42 * 60_000), now, formatAt)).toBe("Resets in 42 min");
    expect(formatResetLabel(at(102 * 60_000), now, formatAt)).toBe("Resets in 1 hr 42 min");
    expect(formatResetLabel(at(2 * 3_600_000), now, formatAt)).toBe("Resets in 2 hr");
    expect(formatResetLabel(at(3 * 86_400_000), now, formatAt)).toBe("Resets Sun 9:00 PM");
  });

  it("puts session, then the account weekly, then the rest", () => {
    const windows = [
      window("model", "weekly", "Weekly · Fable"),
      window("other", "other", "Credits"),
      window("weekly", "weekly", "Weekly"),
      window("session", "session", "Session"),
    ];
    expect(orderPlanWindows(windows).map((w) => w.id)).toEqual([
      "session",
      "weekly",
      "model",
      "other",
    ]);
    const session = { ...windows[3]!, windowDurationMins: 300 };
    expect(limitLabel(windows[3]!, "panel")).toBe("Session");
    expect(limitLabel(session, "panel")).toBe("5-hour session");
    expect(limitLabel(session, "glance")).toBe("5-hour limit");
    expect(limitLabel(windows[2]!, "panel")).toBe("Weekly, all models");
    expect(limitLabel(windows[2]!, "glance")).toBe("Weekly limit");
    expect(limitLabel(windows[0]!, "panel")).toBe("Weekly, Fable");
    expect(limitLabel(windows[1]!, "panel")).toBe("Credits");
    expect(limitLabel(window("m", "monthly", "Monthly"), "glance")).toBe("Monthly limit");
  });

  it("shortens plan names to the tier", () => {
    expect(shortPlanName("Claude Pro Subscription")).toBe("Pro");
    expect(shortPlanName("Claude Max 20x Subscription")).toBe("Max 20x");
    expect(shortPlanName("ChatGPT Plus Subscription")).toBe("Plus");
    expect(shortPlanName("SuperGrok")).toBe("SuperGrok");
    expect(shortPlanName("Claude")).toBe("Claude");
  });

  it("reads the model's selected context window size", () => {
    expect(parseContextWindowSize("1m")).toBe(1_000_000);
    expect(parseContextWindowSize("200k")).toBe(200_000);
    expect(parseContextWindowSize("high")).toBeNull();
    const model = {
      capabilities: {
        optionDescriptors: [
          {
            id: "contextWindow",
            label: "Context Window",
            type: "select" as const,
            options: [
              { id: "200k", label: "200k" },
              { id: "1m", label: "1M", isDefault: true },
            ],
          },
        ],
      },
    };
    expect(contextWindowTokensForModel(model, undefined)).toBe(1_000_000);
    expect(
      contextWindowTokensForModel(model, {
        instanceId: "claudeAgent" as never,
        model: "claude-sonnet-4-6",
        options: [{ id: "contextWindow", value: "200k" }],
      }),
    ).toBe(200_000);
    expect(
      contextWindowTokensForModel({ capabilities: { optionDescriptors: [] } }, undefined),
    ).toBeNull();
    expect(
      contextWindowTokensForModel(
        { capabilities: { optionDescriptors: [] }, contextWindowTokens: 1_000_000 },
        undefined,
      ),
    ).toBe(1_000_000);
    expect(contextWindowTokensForModel(undefined, undefined)).toBeNull();
  });

  it("fills in the model window before the first usage report", () => {
    expect(withKnownContextWindow(null, null)).toBeNull();
    const empty = withKnownContextWindow(null, 1_000_000);
    expect(empty?.usedTokens).toBe(0);
    expect(empty?.maxTokens).toBe(1_000_000);
    expect(empty?.usedPercentage).toBe(0);
    const reported = { ...empty!, usedTokens: 50_000, maxTokens: null, usedPercentage: null };
    expect(withKnownContextWindow(reported, 200_000)?.usedPercentage).toBe(25);
    const sized = { ...empty!, maxTokens: 400_000 };
    expect(withKnownContextWindow(sized, 1_000_000)).toBe(sized);
  });
});

describe("glance and panel helpers", () => {
  const window = (
    id: string,
    kind: ServerProviderUsageWindow["kind"],
    label: string,
    extra: Partial<ServerProviderUsageWindow> = {},
  ) => ({ id, kind, label, usedPercent: 10, ...extra }) satisfies ServerProviderUsageWindow;

  it("keeps session then the plain weekly and drops per-model weeklies", () => {
    const rows = glanceLimitRows([
      window("w_fable", "weekly", "Weekly · Fable"),
      window("w", "weekly", "Weekly"),
      window("s", "session", "Session", { windowDurationMins: 300 }),
    ]);
    expect(rows.map((row) => [row.label, row.window?.id])).toEqual([
      ["5-hour limit", "s"],
      ["Weekly limit", "w"],
    ]);
  });

  it("pairs the weekly row with the session row's model group when every label names a group", () => {
    const rows = glanceLimitRows([
      window("gemini-5h", "session", "Gemini · 5-hour", { windowDurationMins: 300 }),
      window("gemini-weekly", "weekly", "Gemini · Weekly", { usedPercent: 98 }),
      window("3p-5h", "session", "Claude & GPT (shared) · 5-hour", { windowDurationMins: 300 }),
      window("3p-weekly", "weekly", "Claude & GPT (shared) · Weekly"),
    ]);
    expect(rows.map((row) => [row.label, row.window?.id])).toEqual([
      ["5-hour limit", "gemini-5h"],
      ["Weekly limit", "gemini-weekly"],
    ]);
  });

  it("keeps a not-reported row instead of dropping a missing window", () => {
    const rows = glanceLimitRows([window("w", "weekly", "Weekly")]);
    expect(rows.map((row) => [row.label, row.window?.id ?? null])).toEqual([
      ["5-hour limit", null],
      ["Weekly limit", "w"],
    ]);
    expect(glanceLimitRows([])).toEqual([]);
    expect(glanceLimitRows([window("m", "monthly", "Monthly")]).map((row) => row.label)).toEqual([
      "Monthly limit",
    ]);
  });

  it("clears a window whose reset time has passed", () => {
    const now = Date.parse("2026-10-09T12:00:00Z");
    const elapsed = window("s", "session", "Session", {
      usedPercent: 18,
      resetsAt: "2026-10-09T11:59:00Z",
    });
    const active = window("w", "weekly", "Weekly", {
      usedPercent: 40,
      resetsAt: "2026-10-09T12:01:00Z",
    });
    expect(expireElapsedWindow(elapsed, now)).toEqual({
      id: "s",
      kind: "session",
      label: "Session",
      usedPercent: 0,
    });
    expect(expireElapsedWindow(active, now)).toBe(active);
    const rows = glanceLimitRows([elapsed, active], now);
    expect(rows[0]?.window?.usedPercent).toBe(0);
    expect(rows[0]?.window?.resetsAt).toBeUndefined();
    expect(rows[1]?.window).toBe(active);
  });

  it("says used or left explicitly", () => {
    expect(percentText(38.4)).toBe("38% used");
    expect(percentText(38.4, "left")).toBe("62% left");
    expect(percentText(120, "left")).toBe("0% left");
    expect(compactPercentNumber(38.4)).toBe("38%");
    expect(compactPercentNumber(38.4, "left")).toBe("62%");
  });

  it("formats compact window labels and extra window summaries", () => {
    const session = window("s", "session", "Session", { windowDurationMins: 300 });
    const weekly = window("w", "weekly", "Weekly");
    const fable = window("w_fable", "weekly", "Weekly · Fable", { usedPercent: 0 });
    expect(compactWindowLabel(session, "5-hour limit")).toBe("5-hour");
    expect(compactWindowLabel(weekly, "Weekly limit")).toBe("Weekly");
    expect(compactWindowLabel(fable, "Weekly limit")).toBe("Fable wk");
    const primary = glanceLimitRows([fable, weekly, session]);
    expect(extraWindowSummaries([fable, weekly, session], primary, "used")).toEqual([
      { id: "w_fable", label: "Fable wk", value: "0%" },
    ]);
  });

  it("counts reset time down in plain and compact form", () => {
    const now = Date.parse("2026-10-09T12:00:00Z");
    const at = (minutes: number) => new Date(now + minutes * 60_000).toISOString();
    expect(formatResetCountdown(undefined, now)).toBeNull();
    expect(formatResetCountdown("garbage", now)).toBeNull();
    expect(formatResetCountdown(at(-1), now)).toBe("Resets now");
    expect(formatResetCountdown(at(0.5), now)).toBe("Resets in 1 min");
    expect(formatResetCountdown(at(90), now)).toBe("Resets in 1 hr 30 min");
    expect(formatResetCountdown(at(120), now)).toBe("Resets in 2 hr");
    expect(formatResetCountdown(at(60 * 24), now)).toBe("Resets in 1 day");
    expect(formatResetCountdown(at(60 * 76 + 59), now)).toBe("Resets in 3 days 4 hr");
    expect(formatResetCountdown(at(104), now, true)).toBe("1h 44m");
    expect(formatResetCountdown(at(60 * 76), now, true)).toBe("3d 4h");
    expect(formatResetCountdown(at(-5), now, true)).toBe("now");
  });

  it("names accounts by their Providers label first and splits provider headers cleanly", () => {
    expect(accountTitle({ displayName: " Work " }, "Claude")).toBe("Work");
    expect(accountTitle({ displayName: "" }, "Claude")).toBe("Claude");
    expect(accountTitle({ sourceLabel: "CLIProxy" }, "Codex")).toBe("Codex · CLIProxy");
    expect(
      splitAccountHeader(
        { displayName: "Claude (Jake)", label: "Claude (Jake)", plan: "Claude Max Subscription" },
        "Claude",
      ),
    ).toEqual({
      primaryName: "Claude",
      subtitle: "Jake · Max",
    });
  });

  it("groups sibling accounts under their provider card and rotates siblings for Swap", () => {
    const claudeDriver = ProviderDriverKind.make("claudeAgent");
    const codexDriver = ProviderDriverKind.make("codex");
    const makeAcct = (
      id: string,
      driver: ProviderDriverKind,
      displayName: string,
      used5h: number,
      usedWk: number,
    ): UsageLimitsReport["accounts"][number] => ({
      id,
      driver,
      label: displayName,
      displayName,
      limits: {
        checkedAt: "2026-10-09T12:00:00Z",
        windows: [
          window(`${id}-5h`, "session", "Session", {
            windowDurationMins: 300,
            usedPercent: used5h,
          }),
          window(`${id}-wk`, "weekly", "Weekly", { usedPercent: usedWk }),
        ],
      },
    });
    const jake = makeAcct("c-jake", claudeDriver, "Claude (Jake)", 37, 71);
    const justine = makeAcct("c-justine", claudeDriver, "Claude (Justine)", 48, 41);
    const backup = makeAcct("c-backup", claudeDriver, "Claude (Backup)", 10, 12);
    const codex = makeAcct("cx-jake", codexDriver, "Codex (Jake)", 24, 20);
    const groups = groupAccountsByProvider([codex, jake, justine, backup], new Set(["c-jake"]));
    expect(groups).toHaveLength(2);
    expect(groups[1]?.primary.id).toBe("c-jake");
    expect(groups[1]?.siblings.map((s) => s.id)).toEqual(["c-justine", "c-backup"]);

    const swappedOnce = groupAccountsByProvider(
      [codex, jake, justine, backup],
      new Set(["c-jake"]),
      { [claudeDriver]: "c-justine" },
    );
    expect(swappedOnce[1]?.primary.id).toBe("c-justine");
    expect(swappedOnce[1]?.siblings.map((s) => s.id)).toEqual(["c-backup", "c-jake"]);

    expect(siblingAccountSummary(justine, "Claude", "used")).toEqual({
      id: "c-justine",
      name: "Justine",
      summary: "5h 48% · wk 41%",
    });
  });

  it("never invents a zero before the first context report", () => {
    expect(contextWindowFigures(null)).toEqual({ state: "missing" });
    const pending = withKnownContextWindow(null, 250_000);
    expect(contextWindowFigures(pending)).toEqual({ state: "pending", maxTokens: 250_000 });
    const reported = {
      ...pending!,
      usedTokens: 76_400,
      usedPercentage: 30.56,
      updatedAt: "2026-10-09T12:00:00.000Z",
    };
    expect(contextWindowFigures(reported)).toEqual({
      state: "reported",
      usedTokens: 76_400,
      maxTokens: 250_000,
      usedPercent: 31,
    });
    expect(
      contextWindowFigures({ ...reported, maxTokens: null, usedPercentage: null }),
    ).toMatchObject({ state: "reported", maxTokens: null, usedPercent: null });
  });
});

describe("limitsFreshness", () => {
  const now = Date.parse("2026-10-12T12:00:00Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("reports the oldest read and flags it once it passes ten minutes", () => {
    expect(limitsFreshness([ago(20_000), ago(4 * 60_000)], now)).toEqual({
      label: "Checked 4 min ago",
      stale: false,
    });
    expect(limitsFreshness([ago(20_000), ago(2 * 60_000)], now, "updated")).toEqual({
      label: "updated 2 min ago",
      stale: false,
    });
    expect(limitsFreshness([ago(1000), ago(11 * 60_000)], now)).toEqual({
      label: "Checked 11 min ago",
      stale: true,
    });
    expect(limitsFreshness([ago(90 * 60_000)], now)?.label).toBe("Checked 1 hr ago");
    expect(accountFreshnessLabel(ago(2 * 60_000), now)).toBe("updated 2m ago");
  });

  it("says nothing without a usable read time", () => {
    expect(limitsFreshness([], now)).toBeNull();
    expect(limitsFreshness(["not a date"], now)).toBeNull();
  });
});
