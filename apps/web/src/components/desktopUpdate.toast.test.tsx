import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { DesktopUpdateState } from "@t3tools/contracts";

const testState = vi.hoisted(() => ({
  addToast: vi.fn((_toast: unknown) => "toast-1"),
  closeToast: vi.fn(),
}));

vi.mock("./ui/toast", () => ({
  toastManager: { add: testState.addToast, close: testState.closeToast },
}));

import { checkForDesktopUpdateWithFeedback } from "./desktopUpdate.toast";

function downloadedState(overrides: Partial<DesktopUpdateState> = {}): DesktopUpdateState {
  return {
    enabled: true,
    status: "downloaded",
    channel: "latest",
    currentVersion: "0.0.29",
    hostArch: "arm64",
    appArch: "arm64",
    runningUnderArm64Translation: false,
    availableVersion: "0.0.30",
    downloadedVersion: "0.0.30",
    releaseNotes: [],
    omittedReleaseCount: 0,
    downloadPercent: 100,
    checkedAt: null,
    message: null,
    errorContext: null,
    canRetry: true,
    ...overrides,
  };
}

describe("manual desktop update feedback", () => {
  beforeEach(() => testState.addToast.mockClear());

  it("confirms a delayed up-to-date event exactly once and releases the listener", async () => {
    let listener: ((state: DesktopUpdateState) => void) | undefined;
    const unsubscribe = vi.fn();
    const state = downloadedState({ status: "up-to-date", currentVersion: "1.0.7" });
    await checkForDesktopUpdateWithFeedback({
      onUpdateState: (next) => {
        listener = next;
        return unsubscribe;
      },
      checkForUpdate: async () => ({ checked: true, state: { ...state, status: "checking" } }),
    });
    expect(testState.addToast).not.toHaveBeenCalled();
    listener?.(state);
    listener?.(state);
    expect(testState.addToast).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: "success",
        title: "You're up to date",
        description: "Leonidas 1.0.7 is the newest version.",
      }),
    );
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("confirms the result even when the event arrives before the RPC resolves", async () => {
    const state = downloadedState({ status: "up-to-date" });
    let listener: ((state: DesktopUpdateState) => void) | undefined;
    const unsubscribe = vi.fn();
    await checkForDesktopUpdateWithFeedback({
      onUpdateState: (next) => {
        listener = next;
        return unsubscribe;
      },
      checkForUpdate: async () => {
        listener?.(state);
        return { checked: true, state };
      },
    });
    expect(testState.addToast).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("reports a failed check without claiming the app is up to date", async () => {
    const unsubscribe = vi.fn();
    await checkForDesktopUpdateWithFeedback({
      onUpdateState: () => unsubscribe,
      checkForUpdate: async () => ({
        checked: true,
        state: downloadedState({
          status: "error",
          errorContext: "check",
          message: "Network unavailable",
        }),
      }),
    });
    expect(testState.addToast).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: "error",
        title: "Could not check for updates",
        description: "Leonidas could not get the update from the update server.",
        actionProps: expect.objectContaining({ children: "Download installer" }),
        data: expect.objectContaining({ copyText: "Network unavailable" }),
      }),
    );
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
