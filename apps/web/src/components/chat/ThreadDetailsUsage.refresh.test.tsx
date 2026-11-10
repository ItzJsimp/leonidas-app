import { EnvironmentId } from "@t3tools/contracts";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const settingsState = vi.hoisted(() => ({ shown: true, update: vi.fn() }));

const state = vi.hoisted(() => ({ refreshProviders: vi.fn(), release: () => {} }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@t3tools/client-runtime/state/usage", () => ({
  refreshUsageLimits: (_environmentId: string, refresh: () => Promise<unknown>) => refresh(),
}));
vi.mock("../../hooks/useConnectedUsageAccounts", () => ({
  useConnectedUsageAccounts: () => ({ active: [], others: [] }),
}));
vi.mock("../../hooks/useSettings", () => ({
  useClientSettings: (select: (settings: { usageOverlayEnabled: boolean }) => unknown) =>
    select({ usageOverlayEnabled: settingsState.shown }),
  useUpdateClientSettings: () => settingsState.update,
}));
vi.mock("../../hooks/useNowMinute", () => ({ useNowMinute: () => "2026-10-20T12:00" }));
vi.mock("../../state/server", () => ({ serverEnvironment: { refreshProviders: null } }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => state.refreshProviders }));
vi.mock("../../state/queries", () => ({ useThreadContextBreakdown: () => ({}) }));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/dialog", () => ({ Dialog: "div", DialogPanel: "div", DialogPopup: "div" }));
// The trigger renders its `render` element, as the real one does, so the buttons inside exist.
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
  settingsState.shown = true;
  settingsState.update.mockReset();
  state.refreshProviders.mockReset();
  state.refreshProviders.mockImplementation(
    () => new Promise<void>((resolve) => (state.release = resolve)),
  );
});
afterEach(() => {
  act(() => renderer.unmount());
  vi.unstubAllGlobals();
});

it("refreshes once per click and ignores a click while the refresh runs", async () => {
  await act(async () => {
    renderer = create(<ThreadDetailsLimits usage={usage} />);
  });
  const button = () => renderer.root.findByProps({ "aria-label": "Refresh limits" });
  expect(button().props.disabled).toBe(false);
  await act(async () => button().props.onClick());
  expect(state.refreshProviders).toHaveBeenCalledTimes(1);
  expect(button().props.disabled).toBe(true);
  await act(async () => button().props.onClick());
  expect(state.refreshProviders).toHaveBeenCalledTimes(1);
  await act(async () => state.release());
  expect(button().props.disabled).toBe(false);
});

it("shows percent used only, with no switch to percent left", async () => {
  await act(async () => {
    renderer = create(<ThreadDetailsLimits usage={usage} />);
  });
  const seen = new WeakSet();
  const text = JSON.stringify(renderer.toJSON(), (_key, value: unknown) => {
    if (typeof value !== "object" || value === null) return value;
    if (seen.has(value)) return undefined;
    seen.add(value);
    return value;
  });
  expect(text).not.toMatch(/% left|percent left/);
});

it("saves the limits choice: the fold button hides them, the folded line shows them", async () => {
  await act(async () => {
    renderer = create(<ThreadDetailsLimits usage={usage} />);
  });
  await act(async () => renderer.root.findByProps({ "aria-label": "Fold limits" }).props.onClick());
  expect(settingsState.update).toHaveBeenCalledWith({ usageOverlayEnabled: false });

  act(() => renderer.unmount());
  settingsState.shown = false;
  await act(async () => {
    renderer = create(<ThreadDetailsLimits usage={usage} />);
  });
  expect(renderer.root.findAllByProps({ "aria-label": "Fold limits" })).toHaveLength(0);
  const show = renderer.root.find(
    (node) =>
      node.type === "button" && String(node.props["aria-label"]).endsWith("Show all accounts"),
  );
  await act(async () => show.props.onClick());
  expect(settingsState.update).toHaveBeenLastCalledWith({ usageOverlayEnabled: true });
});
