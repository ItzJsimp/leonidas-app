import { ProviderDriverKind, ProviderInstanceId, RunId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import type { ProviderFailoverTarget } from "./providerFailover";
import { formatLimitCountdown, usageLimitRecoveryBannerItem } from "./UsageLimitRecoveryBanner";

const runId = RunId.make("run_123");
const hours = (count: number) => count * 60 * 60_000;
const resetAt = new Date(Date.now() + hours(2)).toISOString();

const defaultProps: Parameters<typeof usageLimitRecoveryBannerItem>[0] = {
  runId,
  resetAt,
  stoppedAt: new Date(Date.now() - 60_000).toISOString(),
  snoozedUntil: null,
  recovery: null,
  accountLabel: "Claude Personal",
  timestampFormat: "12-hour",
  contextTokens: 411_000,
  autoContinueAll: false,
  onOpenSettings: vi.fn(),
  onChange: vi.fn(),
  failoverTargets: [],
  failoverDisabled: false,
  onFailover: vi.fn(),
  onContinue: vi.fn(),
};

const render = (props: Partial<typeof defaultProps> = {}) =>
  renderToStaticMarkup(usageLimitRecoveryBannerItem({ ...defaultProps, ...props }).content);

describe("UsageLimitRecoveryBanner", () => {
  it("keeps the card in front of other notices", () => {
    const item = usageLimitRecoveryBannerItem(defaultProps);
    expect(item.id).toBe("usage-limit-recovery:run_123");
    expect(item.priority).toBe("urgent");
  });

  it("offers the choices, the re-read cost and the all-chats switch", () => {
    const html = render();
    expect(html).toContain("Session limit reached");
    expect(html).toContain("Wait for me");
    expect(html).toContain("Continue at ");
    expect(html).toContain("Re-reads 411k tokens.");
    expect(html).toContain("No other account is ready. Add one in Settings.");
    expect(html).toContain("Keep waiting");
    expect(html).toContain("Auto-continue for all chats:");
    expect(html).toContain(">Off</strong>");
  });

  it("names the other account and what it has left", () => {
    const instanceId = ProviderInstanceId.make("claude_work");
    const target: ProviderFailoverTarget = {
      instanceId,
      driverKind: ProviderDriverKind.make("claudeAgent"),
      label: "Claude Work",
      modelSelection: { instanceId, model: "claude-sonnet-5-5" },
      availableModels: [{ slug: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" }],
    };
    const html = render({ failoverTargets: [target], headroomByInstance: { claude_work: 64 } });
    expect(html).toContain("Claude Work · Claude Sonnet 5.5 · 64% left");
  });

  it("shows only the wait choice when the reset time is unknown", () => {
    const html = render({ resetAt: null });
    expect(html).toContain("Reset time unknown");
    expect(html).not.toContain("Continue at ");
    expect(html).toContain("Try again now");
  });

  it("folds to one line while a send is scheduled", () => {
    const html = render({ recovery: { runId, resetAt, autoResume: true, attempt: 1 } });
    expect(html).toContain("Continues at ");
    expect(html).toContain("Cancel");
    expect(html).not.toContain("Wait for me");
  });

  it("counts the retries", () => {
    const html = render({ recovery: { runId, resetAt, autoResume: true, attempt: 2 } });
    expect(html).toContain("Still limited. Retries at ");
    expect(html).toContain("Try 2 of 3");
  });

  it("does not show a record from before this flow as scheduled", () => {
    const html = render({ recovery: { runId, resetAt, autoResume: true } });
    expect(html).toContain("Wait for me");
  });

  it("offers to continue after the reset", () => {
    const html = render({
      resetAt: new Date(Date.now() - 60_000).toISOString(),
      stoppedAt: new Date(Date.now() - hours(2)).toISOString(),
    });
    expect(html).toContain("Your limit reset");
    expect(html).toContain("Continue chat");
  });

  it("says when the retries are used", () => {
    const html = render({ recovery: { runId, resetAt, autoResume: false, attempt: 4 } });
    expect(html).toContain("Still limited after 3 tries");
  });

  it("formats the countdown", () => {
    expect(formatLimitCountdown(hours(1) + 52 * 60_000)).toBe("1 h 52 m");
    expect(formatLimitCountdown(5 * 60_000)).toBe("5 m");
    expect(formatLimitCountdown(hours(50))).toBe("2 d 2 h");
  });
});
