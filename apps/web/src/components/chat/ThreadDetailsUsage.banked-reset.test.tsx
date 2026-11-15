import { EnvironmentId } from "@t3tools/contracts";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const settingsState = vi.hoisted(() => ({ shown: true, update: vi.fn() }));

const state = vi.hoisted(() => ({
  setConfirming: vi.fn(),
  accounts: {
    active: [] as Array<Record<string, unknown>>,
    others: [] as Array<Record<string, unknown>>,
  },
}));
const credits = { availableCount: 2 };
const limits = { checkedAt: "2026-10-20T11:59:00Z", windows: [], resetCredits: credits };
const defaultAccounts = () => ({
  active: [{ id: "test:codex-1", driver: "codex", label: "Codex", instanceId: "codex-1", limits }],
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
});

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@t3tools/client-runtime/state/usage", () => ({ refreshUsageLimits: vi.fn() }));
vi.mock("../../hooks/useConnectedUsageAccounts", () => ({
  useConnectedUsageAccounts: () => state.accounts,
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
vi.mock("./PlanUsageLimits", () => ({
  UsageBar: ({ label }: { readonly label: string }) => <span data-usage-bar={label} />,
}));
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
  state.accounts = defaultAccounts();
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

it("pairs Antigravity secondary windows onto one row per family without dropping Gemini 4 Argon", async () => {
  state.accounts = {
    active: [
      {
        id: "test:antigravity-1",
        driver: "antigravity",
        label: "Antigravity",
        instanceId: "antigravity-1",
        limits: {
          checkedAt: "2026-10-20T11:59:00Z",
          windows: [
            {
              id: "gem-5h",
              kind: "session",
              label: "Gemini · 5-hour",
              windowDurationMins: 300,
              usedPercent: 60,
            },
            { id: "gem-w", kind: "weekly", label: "Gemini · Weekly", usedPercent: 20 },
            {
              id: "3p-5h",
              kind: "session",
              label: "Claude & GPT (shared) · 5-hour",
              windowDurationMins: 300,
              usedPercent: 30,
            },
            {
              id: "3p-w",
              kind: "weekly",
              label: "Claude & GPT (shared) · Weekly",
              usedPercent: 40,
            },
            { id: "argon-w", kind: "weekly", label: "Gemini 4 Argon · Weekly", usedPercent: 50 },
          ],
        },
      },
    ],
    others: [],
  };

  await act(async () => {
    renderer = create(<ThreadDetailsLimits usage={usage} />);
  });
  const sharedLabels = renderer.root.findAll(
    (node) => node.type === "span" && node.children.includes("Claude & GPT"),
  );
  const argonLabels = renderer.root.findAll(
    (node) => node.type === "span" && node.children.includes("Gemini 4 Argon"),
  );
  expect(sharedLabels).toHaveLength(1);
  expect(argonLabels).toHaveLength(1);
  const bars = renderer.root
    .findAll((node) => node.type === "span" && node.props["data-usage-bar"] !== undefined)
    .map((node) => node.props["data-usage-bar"]);
  expect(bars).toEqual([
    "Gemini 5h: 60% used",
    "Gemini wk: 20% used",
    "Claude & GPT 5h: 30% used",
    "Claude & GPT wk: 40% used",
    "Gemini 4 Argon wk: 50% used",
  ]);
});
