import { EnvironmentId } from "@t3tools/contracts";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const settingsState = vi.hoisted(() => ({ shown: true, update: vi.fn() }));

const state = vi.hoisted(() => ({ setConfirming: vi.fn() }));
const credits = { availableCount: 2 };
const limits = { checkedAt: "2026-10-20T11:59:00Z", windows: [], resetCredits: credits };
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@t3tools/client-runtime/state/usage", () => ({ refreshUsageLimits: vi.fn() }));
vi.mock("../../hooks/useConnectedUsageAccounts", () => ({
  useConnectedUsageAccounts: () => ({
    active: [
      { id: "test:codex-1", driver: "codex", label: "Codex", instanceId: "codex-1", limits },
    ],
    // Signed in on another environment: this one cannot redeem for it.
    others: [
      { id: "other:codex-2", driver: "codex", label: "Codex", instanceId: "c2", limits },
      // No banked resets: its row still keeps the empty slot, so chips line up.
      {
        id: "test:claude-1",
        driver: "claudeAgent",
        label: "Claude",
        instanceId: "claude-1",
        limits: { checkedAt: limits.checkedAt, windows: [] },
      },
    ],
  }),
}));
vi.mock("../../hooks/useSettings", () => ({
  useClientSettings: (select: (settings: { usageOverlayEnabled: boolean }) => unknown) =>
    select({ usageOverlayEnabled: settingsState.shown }),
  useUpdateClientSettings: () => settingsState.update,
}));
vi.mock("../../hooks/useNowMinute", () => ({ useNowMinute: () => "2026-10-20T12:00" }));
vi.mock("../../state/server", () => ({ serverEnvironment: { refreshProviders: null } }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("../../state/queries", () => ({ useThreadContextBreakdown: () => ({}) }));
vi.mock("../usage/UsageLimits", () => ({
  ResetCreditDialog: () => null,
  resetCreditsSummary: () => "2 banked",
  useResetCredit: () => ({
    canManageProviders: true,
    confirming: false,
    setConfirming: state.setConfirming,
    busy: false,
    status: null,
    redeem: vi.fn(),
  }),
}));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/dialog", () => ({ Dialog: "div", DialogPanel: "div", DialogPopup: "div" }));
vi.mock("../ui/tooltip", async () => {
  const { cloneElement, isValidElement } = await import("react");
  return {
    Tooltip: "div",
    TooltipPopup: "div",
    TooltipTrigger: ({ render, children }: { render?: unknown; children?: React.ReactNode }) =>
      isValidElement(render) ? cloneElement(render, undefined, children) : children,
  };
});
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

let renderer: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.setConfirming.mockReset();
});
afterEach(() => {
  act(() => renderer.unmount());
  vi.unstubAllGlobals();
});

it("offers Use reset only for banked credits this environment can redeem", async () => {
  await act(async () => {
    renderer = create(<ThreadDetailsLimits usage={usage} />);
  });
  const useButtons = renderer.root.findAll(
    (node) => node.type === "button" && String(node.props["aria-label"]).startsWith("Use reset"),
  );
  expect(useButtons).toHaveLength(1);
  await act(async () => useButtons[0]!.props.onClick());
  expect(state.setConfirming).toHaveBeenCalledWith(true);
});

it("keeps one reset slot on every account row, filled only where resets are banked", async () => {
  await act(async () => {
    renderer = create(<ThreadDetailsLimits usage={usage} />);
  });
  const slots = renderer.root.findAll(
    (node) => node.type === "span" && node.props["data-reset-slot"] !== undefined,
  );
  expect(slots).toHaveLength(3);
  const filled = slots.map((slot) => slot.children.length > 0);
  expect(filled).toEqual([true, true, false]);
});
