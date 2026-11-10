import { EnvironmentId, ProviderDriverKind } from "@t3tools/contracts";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

// `useNowMinute` is fixed below, so every timer delay is measured from this instant.
const NOW = Date.parse("2026-10-20T12:00:00Z");
const state = vi.hoisted(() => ({
  refreshUsageLimits: vi.fn(),
  accounts: [] as ReadonlyArray<unknown>,
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@t3tools/client-runtime/state/usage", () => ({
  refreshUsageLimits: state.refreshUsageLimits,
}));
vi.mock("../../hooks/useConnectedUsageAccounts", () => ({
  useConnectedUsageAccounts: () => ({ active: state.accounts, others: [] }),
}));
vi.mock("../../hooks/useNowMinute", () => ({ useNowMinute: () => "2026-10-20T12:00" }));
vi.mock("../../state/server", () => ({ serverEnvironment: { refreshProviders: null } }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("../../state/queries", () => ({ useThreadContextBreakdown: () => ({}) }));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/dialog", () => ({ Dialog: "div", DialogPanel: "div", DialogPopup: "div" }));
vi.mock("../ui/tooltip", () => ({ Tooltip: "div", TooltipPopup: "div", TooltipTrigger: "div" }));
vi.mock("./DetailedContextBreakdownView", () => ({ DetailedContextBreakdownView: () => null }));
vi.mock("./ProviderInstanceIcon", () => ({ ProviderInstanceIcon: () => null }));
vi.mock("./PlanUsageLimits", () => ({ UsageBar: () => null }));
vi.mock("./UsageBenchmarks", () => ({ UsageBenchmarks: () => null }));
vi.mock("./ContextWindowMeter", () => ({ ContextRing: () => null }));

import { ThreadDetailsLimits, type ThreadDetailsUsageProps } from "./ThreadDetailsUsage";

const usage: ThreadDetailsUsageProps = {
  environmentId: EnvironmentId.make("test"),
  threadId: null,
  instanceId: null,
  modelLabel: "Model",
  effortLabel: null,
  contextWindow: null,
  providerEntries: [],
  onStartChat: null,
  onStartArena: null,
};

const SECOND = 1000;
const HOUR = 60 * 60 * SECOND;

function accountWithResets(...resetsAt: ReadonlyArray<string>) {
  return {
    id: "account-1",
    driver: ProviderDriverKind.make("codex"),
    label: "Account",
    limits: {
      checkedAt: "2026-10-20T11:59:00.000Z",
      windows: resetsAt.map((at, index) => ({
        id: `window-${index}`,
        kind: "session" as const,
        label: "Session",
        usedPercent: 10,
        resetsAt: at,
      })),
    },
  };
}

const inSeconds = (seconds: number) => new Date(NOW + seconds * SECOND).toISOString();

let renderer: ReactTestRenderer | null = null;
async function mountCard(...resetsAt: ReadonlyArray<string>) {
  state.accounts = [accountWithResets(...resetsAt)];
  await act(async () => {
    renderer = create(<ThreadDetailsLimits usage={usage} folded={false} />);
  });
}
const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // The 5 minute poll reads `document.visibilityState`; keep it quiet when 24 h passes.
  vi.stubGlobal("document", { visibilityState: "hidden" });
  vi.useFakeTimers();
  state.refreshUsageLimits.mockReset();
  state.refreshUsageLimits.mockResolvedValue(undefined);
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("refreshes once, automatically, 5 s after the next window resets", async () => {
  await mountCard(inSeconds(60));
  await advance(64 * SECOND);
  expect(state.refreshUsageLimits).not.toHaveBeenCalled();
  await advance(1 * SECOND);
  expect(state.refreshUsageLimits).toHaveBeenCalledTimes(1);
  expect(state.refreshUsageLimits.mock.calls[0]?.[0]).toBe("test");
  expect(state.refreshUsageLimits.mock.calls[0]?.[2]).toBe(true);
});

it("clears the reset timer when the card unmounts", async () => {
  await mountCard(inSeconds(60));
  await advance(30 * SECOND);
  act(() => renderer?.unmount());
  await advance(10 * 60 * SECOND);
  expect(state.refreshUsageLimits).not.toHaveBeenCalled();
});

it("clamps a reset more than 24 h away to a 24 h delay", async () => {
  await mountCard(inSeconds(72 * 60 * 60));
  await advance(24 * HOUR - SECOND);
  expect(state.refreshUsageLimits).not.toHaveBeenCalled();
  await advance(SECOND);
  expect(state.refreshUsageLimits).toHaveBeenCalledTimes(1);
  expect(state.refreshUsageLimits.mock.calls[0]?.[2]).toBe(true);
});

it("arms the timer from the valid reset when another window has an unparseable one", async () => {
  await mountCard("not-a-date", inSeconds(60));
  await advance(64 * SECOND);
  expect(state.refreshUsageLimits).not.toHaveBeenCalled();
  await advance(SECOND);
  expect(state.refreshUsageLimits).toHaveBeenCalledTimes(1);
});

it("does not arm a timer when no window has a usable future reset", async () => {
  await mountCard("not-a-date", inSeconds(-60));
  await advance(25 * HOUR);
  expect(state.refreshUsageLimits).not.toHaveBeenCalled();
});
