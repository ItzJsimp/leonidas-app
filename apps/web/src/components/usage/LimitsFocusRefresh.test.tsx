import { EnvironmentId } from "@t3tools/contracts";
import { act, createElement } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({
  presentations: new Map<string, unknown>(),
  refreshProviders: vi.fn(async () => undefined),
}));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => state.presentations }));
vi.mock("../../state/presentation", () => ({
  environmentPresentations: { presentationsAtom: null },
}));
vi.mock("../../state/server", () => ({ serverEnvironment: { refreshProviders: null } }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => state.refreshProviders }));

import { FOCUS_REFRESH_COOLDOWN_MS, LimitsFocusRefresh } from "./LimitsFocusRefresh";

const connected = { connection: { phase: "connected" }, serverConfig: {} };

describe("LimitsFocusRefresh", () => {
  let renderer: ReactTestRenderer | undefined;
  const document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const window = new EventTarget();

  beforeEach(() => {
    vi.useFakeTimers({ now: Date.parse("2026-10-28T20:00:00.000Z") });
    vi.stubGlobal("document", document);
    vi.stubGlobal("window", window);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    state.refreshProviders.mockClear();
    state.presentations = new Map<string, unknown>([
      [EnvironmentId.make("desktop"), connected],
      [EnvironmentId.make("down"), { connection: { phase: "disconnected" }, serverConfig: null }],
    ]);
    act(() => {
      renderer = create(createElement(LimitsFocusRefresh));
    });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("re-reads limits when the window gains focus, once a minute, for connected environments only", async () => {
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(state.refreshProviders).toHaveBeenCalledTimes(1);
    expect(state.refreshProviders).toHaveBeenCalledWith({
      environmentId: "desktop",
      input: {},
    });

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(state.refreshProviders).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + FOCUS_REFRESH_COOLDOWN_MS + 1);
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(state.refreshProviders).toHaveBeenCalledTimes(2);
  });

  it("does nothing while the window is hidden", async () => {
    document.visibilityState = "hidden";
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(state.refreshProviders).not.toHaveBeenCalled();
    document.visibilityState = "visible";
  });
});
