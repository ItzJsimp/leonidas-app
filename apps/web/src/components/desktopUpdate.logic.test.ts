import { describe, expect, it } from "vite-plus/test";
import type { DesktopUpdateActionResult, DesktopUpdateState } from "@t3tools/contracts";

import {
  canCheckForUpdate,
  getArm64IntelBuildWarningDescription,
  getDesktopUpdateActionError,
  getDesktopUpdateButtonTooltip,
  getDesktopUpdateInstallConfirmationMessage,
  getWhatsNewItems,
  isDesktopUpdateButtonDisabled,
  resolveDesktopUpdateButtonAction,
  AUTO_INSTALL_IDLE_MS,
  groupReleaseNotes,
  resolveUpdatePill,
  shouldInstallAutomatically,
  summarizeUpdate,
  shouldShowArm64IntelBuildWarning,
} from "./desktopUpdate.logic";

const baseState: DesktopUpdateState = {
  enabled: true,
  status: "idle",
  channel: "latest",
  currentVersion: "1.0.0",
  hostArch: "x64",
  appArch: "x64",
  runningUnderArm64Translation: false,
  availableVersion: null,
  downloadedVersion: null,
  releaseNotes: [],
  omittedReleaseCount: 0,
  downloadPercent: null,
  checkedAt: null,
  message: null,
  errorContext: null,
  canRetry: false,
};

describe("desktop update button state", () => {
  it("shows a download action when an update is available", () => {
    const state: DesktopUpdateState = {
      ...baseState,
      status: "available",
      availableVersion: "1.1.0",
    };
    expect(resolveDesktopUpdateButtonAction(state)).toBe("download");
  });

  it("keeps retry action available after a download error", () => {
    const state: DesktopUpdateState = {
      ...baseState,
      status: "error",
      availableVersion: "1.1.0",
      message: "network timeout",
      errorContext: "download",
      canRetry: true,
    };
    expect(resolveDesktopUpdateButtonAction(state)).toBe("download");
    expect(getDesktopUpdateButtonTooltip(state)).toContain("Click to retry");
  });

  it("keeps install action available after an install error", () => {
    const state: DesktopUpdateState = {
      ...baseState,
      status: "error",
      downloadedVersion: "1.1.0",
      availableVersion: "1.1.0",
      message: "shutdown timeout",
      errorContext: "install",
      canRetry: true,
    };
    expect(resolveDesktopUpdateButtonAction(state)).toBe("install");
    expect(getDesktopUpdateButtonTooltip(state)).toContain("Click to retry");
  });

  it("keeps install action available after a background updater error", () => {
    const state: DesktopUpdateState = {
      ...baseState,
      status: "error",
      downloadedVersion: "1.1.0",
      availableVersion: "1.1.0",
      message: "background updater error",
      errorContext: null,
      canRetry: true,
    };
    expect(resolveDesktopUpdateButtonAction(state)).toBe("install");
    expect(getDesktopUpdateButtonTooltip(state)).toContain("Click to restart and install");
  });

  it("prefers a newly available release over a stale downloaded version", () => {
    const state: DesktopUpdateState = {
      ...baseState,
      status: "available",
      availableVersion: "1.2.0",
      downloadedVersion: "1.1.0",
    };
    expect(resolveDesktopUpdateButtonAction(state)).toBe("download");
  });

  it("hides the install action while checking for a newer release", () => {
    const state: DesktopUpdateState = {
      ...baseState,
      status: "checking",
      availableVersion: "1.1.0",
      downloadedVersion: "1.1.0",
      downloadPercent: 100,
    };
    expect(resolveDesktopUpdateButtonAction(state)).toBe("none");
  });

  it("has no action for non-actionable check errors", () => {
    const state: DesktopUpdateState = {
      ...baseState,
      status: "error",
      message: "network unavailable",
      errorContext: "check",
      canRetry: true,
    };
    expect(resolveDesktopUpdateButtonAction(state)).toBe("none");
  });

  it("disables the button while downloading", () => {
    const state: DesktopUpdateState = {
      ...baseState,
      status: "downloading",
      availableVersion: "1.1.0",
      downloadPercent: 42.5,
    };
    expect(isDesktopUpdateButtonDisabled(state)).toBe(true);
    expect(getDesktopUpdateButtonTooltip(state)).toContain("42%");
  });
});

describe("getDesktopUpdateActionError", () => {
  it("returns user-visible message for accepted failed attempts", () => {
    const result: DesktopUpdateActionResult = {
      accepted: true,
      completed: false,
      state: {
        ...baseState,
        status: "available",
        availableVersion: "1.1.0",
        message: "checksum mismatch",
        errorContext: "download",
        canRetry: true,
      },
    };
    expect(getDesktopUpdateActionError(result)).toBe("checksum mismatch");
  });

  it("ignores messages for non-accepted attempts", () => {
    const result: DesktopUpdateActionResult = {
      accepted: false,
      completed: false,
      state: {
        ...baseState,
        status: "error",
        message: "background failure",
        errorContext: "check",
        canRetry: false,
      },
    };
    expect(getDesktopUpdateActionError(result)).toBeNull();
  });

  it("ignores messages for successful attempts", () => {
    const result: DesktopUpdateActionResult = {
      accepted: true,
      completed: true,
      state: {
        ...baseState,
        status: "downloaded",
        downloadedVersion: "1.1.0",
        availableVersion: "1.1.0",
        message: null,
        errorContext: null,
        canRetry: true,
      },
    };
    expect(getDesktopUpdateActionError(result)).toBeNull();
  });
});

describe("desktop update UI helpers", () => {
  it("shows an Apple Silicon warning for Intel builds under Rosetta", () => {
    const state: DesktopUpdateState = {
      ...baseState,
      hostArch: "arm64",
      appArch: "x64",
      runningUnderArm64Translation: true,
    };

    expect(shouldShowArm64IntelBuildWarning(state)).toBe(true);
    expect(getArm64IntelBuildWarningDescription(state)).toContain("Apple Silicon");
    expect(getArm64IntelBuildWarningDescription(state)).toContain("Intel build");
  });

  it("changes the warning copy when a native build update is ready to download", () => {
    const state: DesktopUpdateState = {
      ...baseState,
      hostArch: "arm64",
      appArch: "x64",
      runningUnderArm64Translation: true,
      status: "available",
      availableVersion: "1.1.0",
    };

    expect(getArm64IntelBuildWarningDescription(state)).toContain("Download the available update");
  });

  it("includes the downloaded version in the install confirmation copy", () => {
    expect(
      getDesktopUpdateInstallConfirmationMessage({
        availableVersion: "1.1.0",
        downloadedVersion: "1.1.1",
      }),
    ).toContain("Install update 1.1.1 and restart Leonidas?");
  });

  it("falls back to generic install confirmation copy when no version is available", () => {
    expect(
      getDesktopUpdateInstallConfirmationMessage({
        availableVersion: null,
        downloadedVersion: null,
      }),
    ).toContain("Install update and restart Leonidas?");
  });

  it("keeps the same install confirmation copy across desktop platforms", () => {
    expect(
      getDesktopUpdateInstallConfirmationMessage({
        availableVersion: "1.1.0",
        downloadedVersion: "1.1.0",
      }),
    ).toBe(
      "Install update 1.1.0 and restart Leonidas?\n\nAny running chat will stop. Check that you are ready, then continue.",
    );
  });
});

describe("getDesktopUpdateInstallConfirmationMessage with running chats", () => {
  it("says how many chats will stop and that the update installs by itself later", () => {
    const state = { availableVersion: "1.1.0", downloadedVersion: "1.1.0" };
    expect(getDesktopUpdateInstallConfirmationMessage(state, 1)).toContain(
      "1 chat is running and will stop.",
    );
    const many = getDesktopUpdateInstallConfirmationMessage(state, 3);
    expect(many).toContain("3 chats are running and will stop.");
    expect(many).toContain("installs by itself when your AI is done");
  });
});

describe("shouldInstallAutomatically", () => {
  const ready = {
    enabled: true,
    hasDownloadedUpdate: true,
    runningCount: 0,
    idleMs: AUTO_INSTALL_IDLE_MS,
  };
  it("installs once no AI work runs and the person has been away long enough", () => {
    expect(shouldInstallAutomatically(ready)).toBe(true);
  });
  it.each([
    ["the person was active a moment ago", { idleMs: AUTO_INSTALL_IDLE_MS - 1 }],
    ["a chat is still running", { runningCount: 1 }],
    ["nothing is downloaded", { hasDownloadedUpdate: false }],
    ["automatic updates are off", { enabled: false }],
  ] as const)("waits when %s", (_name, override) => {
    expect(shouldInstallAutomatically({ ...ready, ...override })).toBe(false);
  });
});

describe("resolveUpdatePill", () => {
  const notable = [{ version: "1.1.0", items: ["Added a thing."], totalItems: 1, notable: true }];
  const small = [{ version: "1.1.0", items: ["Fixed a thing."], totalItems: 1, notable: false }];
  const downloaded = {
    ...baseState,
    status: "downloaded" as const,
    downloadedVersion: "1.1.0",
    availableVersion: "1.1.0",
  };

  it("shows Ready for a notable downloaded update", () => {
    expect(resolveUpdatePill({ ...downloaded, releaseNotes: notable }, "notable")).toBe("ready");
  });
  it("stays silent for a small patch unless the person wants every update", () => {
    expect(resolveUpdatePill({ ...downloaded, releaseNotes: small }, "notable")).toBeNull();
    expect(resolveUpdatePill({ ...downloaded, releaseNotes: small }, "all")).toBe("ready");
  });
  it("never shows a mark when the person chose Never", () => {
    expect(resolveUpdatePill({ ...downloaded, releaseNotes: notable }, "never")).toBeNull();
  });
  it("shows Paused after a failed download or install that can retry", () => {
    const failedDownload = {
      ...baseState,
      status: "available" as const,
      availableVersion: "1.1.0",
      releaseNotes: notable,
      errorContext: "download" as const,
      canRetry: true,
    };
    expect(resolveUpdatePill(failedDownload, "notable")).toBe("paused");
    const failedInstall = {
      ...downloaded,
      releaseNotes: notable,
      errorContext: "install" as const,
      canRetry: true,
    };
    expect(resolveUpdatePill(failedInstall, "notable")).toBe("paused");
  });
  it("shows nothing while an update is only downloading, or without state", () => {
    expect(
      resolveUpdatePill({ ...baseState, status: "downloading", releaseNotes: notable }, "notable"),
    ).toBeNull();
    expect(resolveUpdatePill(null, "notable")).toBeNull();
  });
});

describe("groupReleaseNotes", () => {
  it("groups by verb, in the order New, Improvements, Fixes, and drops empty groups and repeats", () => {
    expect(
      groupReleaseNotes(["Fixed a crash.", "Added a pill.", "Changed the list.", "Added a pill."]),
    ).toEqual([
      { title: "New", items: ["Added a pill."] },
      { title: "Improvements", items: ["Changed the list."] },
      { title: "Fixes", items: ["Fixed a crash."] },
    ]);
    expect(groupReleaseNotes([])).toEqual([]);
  });
});

describe("summarizeUpdate", () => {
  const notes = Array.from({ length: 7 }, (_, index) => `Added thing ${index + 1}.`);
  const state = (currentVersion: string, version: string): DesktopUpdateState => ({
    ...baseState,
    status: "downloaded",
    currentVersion,
    downloadedVersion: version,
    availableVersion: version,
    releaseNotes: [{ version, items: notes, totalItems: 7, notable: true }],
  });

  it("lists five highlights and counts the rest", () => {
    const summary = summarizeUpdate(state("0.124.100", "0.124.101"));
    expect(summary.highlights).toHaveLength(5);
    expect(summary.moreCount).toBe(2);
    expect(summary.spansReleases).toBe(false);
    expect(summary.updateCount).toBeNull();
  });
  it("counts the releases between two patch versions", () => {
    const summary = summarizeUpdate(state("0.124.95", "0.124.100"));
    expect(summary.updateCount).toBe(5);
    expect(summary.spansReleases).toBe(true);
  });
  it("marks a jump across minor versions without guessing a count", () => {
    const summary = summarizeUpdate(state("0.124.95", "0.125.2"));
    expect(summary.updateCount).toBeNull();
    expect(summary.spansReleases).toBe(true);
  });
});

describe("canCheckForUpdate", () => {
  it("returns false for null state", () => {
    expect(canCheckForUpdate(null)).toBe(false);
  });

  it("returns false when updates are disabled", () => {
    expect(canCheckForUpdate({ ...baseState, enabled: false, status: "disabled" })).toBe(false);
  });

  it("returns false while checking", () => {
    expect(canCheckForUpdate({ ...baseState, status: "checking" })).toBe(false);
  });

  it("returns false while downloading", () => {
    expect(canCheckForUpdate({ ...baseState, status: "downloading", downloadPercent: 50 })).toBe(
      false,
    );
  });

  it("returns true once an update has been downloaded so newer releases can be found", () => {
    expect(
      canCheckForUpdate({
        ...baseState,
        status: "downloaded",
        availableVersion: "1.1.0",
        downloadedVersion: "1.1.0",
      }),
    ).toBe(true);
  });

  it("returns true when idle", () => {
    expect(canCheckForUpdate({ ...baseState, status: "idle" })).toBe(true);
  });

  it("returns true when up-to-date", () => {
    expect(canCheckForUpdate({ ...baseState, status: "up-to-date" })).toBe(true);
  });

  it("returns true when an update is available", () => {
    expect(
      canCheckForUpdate({ ...baseState, status: "available", availableVersion: "1.1.0" }),
    ).toBe(true);
  });

  it("returns true on error so the user can retry", () => {
    expect(
      canCheckForUpdate({
        ...baseState,
        status: "error",
        errorContext: "check",
        message: "network",
      }),
    ).toBe(true);
  });
});

describe("getDesktopUpdateButtonTooltip", () => {
  it("returns 'Up to date' for non-actionable states", () => {
    expect(getDesktopUpdateButtonTooltip({ ...baseState, status: "idle" })).toBe("Up to date");
    expect(getDesktopUpdateButtonTooltip({ ...baseState, status: "up-to-date" })).toBe(
      "Up to date",
    );
  });
});

describe("getWhatsNewItems", () => {
  it("flattens release note groups in order and caps at 8 bullets", () => {
    const items = Array.from({ length: 6 }, (_, i) => `item ${i}`);
    const state = {
      ...baseState,
      releaseNotes: [
        { version: "1.0.2", items, totalItems: 6 },
        { version: "1.0.1", items, totalItems: 6 },
      ],
    };
    const result = getWhatsNewItems(state);
    expect(result).toHaveLength(8);
    expect(result.slice(0, 2)).toEqual(["item 0", "item 1"]);
    expect(getWhatsNewItems(baseState)).toEqual([]);
  });
});
