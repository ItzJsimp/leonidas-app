import type { DesktopUpdateActionResult, DesktopUpdateState } from "@t3tools/contracts";
import { compareSemverVersions } from "@t3tools/shared/semver";

import type { UpdateNoticeLevel } from "../state/desktopUpdate";

export type DesktopUpdateButtonAction = "download" | "install" | "none";

/**
 * The main process fills `downloadedVersion` from the updater's `update-downloaded`
 * event, which is dispatched on its own fiber. A download RPC can therefore resolve
 * before that write lands, so fall back to the version the download was started for.
 */
export function getDesktopUpdateDownloadedVersion(state: DesktopUpdateState): string | null {
  return state.downloadedVersion ?? state.availableVersion;
}

export function resolveDesktopUpdateButtonAction(
  state: DesktopUpdateState,
): DesktopUpdateButtonAction {
  if (
    state.downloadedVersion &&
    (state.status === "downloaded" ||
      (state.status === "error" &&
        (state.errorContext === null || state.errorContext === "install")))
  ) {
    return "install";
  }
  if (state.status === "available") {
    return "download";
  }
  if (state.status === "error") {
    if (state.errorContext === "download" && state.availableVersion) {
      return "download";
    }
  }
  return "none";
}

export function shouldShowArm64IntelBuildWarning(state: DesktopUpdateState | null): boolean {
  return state?.hostArch === "arm64" && state.appArch === "x64";
}

export function isDesktopUpdateButtonDisabled(state: DesktopUpdateState | null): boolean {
  return state?.status === "downloading";
}

export function getArm64IntelBuildWarningDescription(state: DesktopUpdateState): string {
  if (!shouldShowArm64IntelBuildWarning(state)) {
    return "This install uses the correct version for your Mac.";
  }

  const action = resolveDesktopUpdateButtonAction(state);
  if (action === "download") {
    return "This Mac has Apple Silicon, but Leonidas uses the Intel build. Download the available update to switch to the Apple Silicon build.";
  }
  if (action === "install") {
    return "This Mac has Apple Silicon, but Leonidas uses the Intel build. Restart to install the downloaded Apple Silicon build.";
  }
  return "This Mac has Apple Silicon, but Leonidas uses the Intel build. The next update will switch it to the Apple Silicon build.";
}

export function getDesktopUpdateButtonTooltip(state: DesktopUpdateState): string {
  if (state.status === "available") {
    return `Update ${state.availableVersion ?? "available"} is ready to download`;
  }
  if (state.status === "downloading") {
    const progress =
      typeof state.downloadPercent === "number" ? ` (${Math.floor(state.downloadPercent)}%)` : "";
    return `Downloading update${progress}`;
  }
  if (state.status === "downloaded") {
    return `Update ${state.downloadedVersion ?? state.availableVersion ?? "ready"} downloaded. Click to restart and install.`;
  }
  if (state.status === "error") {
    if (state.errorContext === "download" && state.availableVersion) {
      return `Download failed for ${state.availableVersion}. Click to retry.`;
    }
    if (state.errorContext === "install" && state.downloadedVersion) {
      return `Install failed for ${state.downloadedVersion}. Click to retry.`;
    }
    if (state.downloadedVersion) {
      return `Update ${state.downloadedVersion} downloaded. Click to restart and install.`;
    }
    return state.message ?? "The update failed. Click to try again.";
  }
  return "Up to date";
}

export function getDesktopUpdateInstallConfirmationMessage(
  state: Pick<DesktopUpdateState, "availableVersion" | "downloadedVersion">,
  runningChatCount = 0,
): string {
  const version = state.downloadedVersion ?? state.availableVersion;
  const head = `Install update${version ? ` ${version}` : ""} and restart Leonidas?`;
  if (runningChatCount > 0) {
    const chats =
      runningChatCount === 1
        ? "1 chat is running and will stop."
        : `${runningChatCount} chats are running and will stop.`;
    return `${head}

${chats} To keep them running, choose Cancel. The update installs by itself when your AI is done.`;
  }
  return `${head}

Any running chat will stop. Check that you are ready, then continue.`;
}

export function getDesktopUpdateActionError(result: DesktopUpdateActionResult): string | null {
  if (!result.accepted || result.completed) return null;
  if (typeof result.state.message !== "string") return null;
  const message = result.state.message.trim();
  return message.length > 0 ? message : null;
}

export function canCheckForUpdate(state: DesktopUpdateState | null): boolean {
  if (!state || !state.enabled) return false;
  return (
    state.status !== "checking" && state.status !== "downloading" && state.status !== "disabled"
  );
}

const WHATS_NEW_MAX_ITEMS = 8;

/** Show every note for this build; keep the old bounded fallback for multi-release feeds. */
export function getWhatsNewItems(
  state: DesktopUpdateState,
  version?: string | null,
): ReadonlyArray<string> {
  if (version) {
    const requestedVersion = version.trim().replace(/^v/i, "");
    const exactRelease = state.releaseNotes.find(
      (note) => note.version.trim().replace(/^v/i, "") === requestedVersion,
    );
    return exactRelease?.items ?? state.releaseNotes[0]?.items ?? [];
  }
  return state.releaseNotes.flatMap((note) => note.items).slice(0, WHATS_NEW_MAX_ITEMS);
}

/** No keyboard, pointer or scroll input for this long counts as away from the keyboard. */
export const AUTO_INSTALL_IDLE_MS = 5 * 60 * 1000;

/**
 * Automatic install: a downloaded update installs only when no AI work runs and the person has been
 * away a while. It never restarts the app in the middle of work. Quitting installs it too (main process).
 */
export function shouldInstallAutomatically(input: {
  readonly enabled: boolean;
  readonly hasDownloadedUpdate: boolean;
  readonly runningCount: number;
  readonly idleMs: number;
}): boolean {
  return (
    input.enabled &&
    input.hasDownloadedUpdate &&
    input.runningCount === 0 &&
    input.idleMs >= AUTO_INSTALL_IDLE_MS
  );
}

export type UpdatePillKind = "ready" | "paused";

/** What the rail pill shows. Small fixes install without any mark unless the person asked to hear about all updates. */
export function resolveUpdatePill(
  state: DesktopUpdateState | null,
  level: UpdateNoticeLevel,
): UpdatePillKind | null {
  if (!state || level === "never") return null;
  if (level === "notable" && !state.releaseNotes.some((note) => note.notable === true)) return null;
  const failed = state.errorContext === "download" || state.errorContext === "install";
  if (failed && state.canRetry) return "paused";
  return state.status === "downloaded" ? "ready" : null;
}

export type NoteGroupTitle = "New" | "Improvements" | "Fixes";

/** Patch notes start with a verb: Added is new, Fixed is a fix, anything else is an improvement. */
export function groupReleaseNotes(
  notes: ReadonlyArray<string>,
): ReadonlyArray<{ readonly title: NoteGroupTitle; readonly items: ReadonlyArray<string> }> {
  const groups: Record<NoteGroupTitle, string[]> = { New: [], Improvements: [], Fixes: [] };
  for (const note of new Set(notes)) {
    const verb = /^[A-Za-z]+/.exec(note)?.[0]?.toLowerCase();
    groups[verb === "added" ? "New" : verb === "fixed" ? "Fixes" : "Improvements"].push(note);
  }
  return (["New", "Improvements", "Fixes"] as const)
    .filter((title) => groups[title].length > 0)
    .map((title) => ({ title, items: groups[title] }));
}

export const UPDATE_HIGHLIGHT_COUNT = 5;

export interface UpdateSummary {
  readonly version: string | null;
  readonly highlights: ReadonlyArray<string>;
  /** Changes in the newest release that the popover does not list. */
  readonly moreCount: number;
  /** Releases between the running version and this one, when they share a minor version. */
  readonly updateCount: number | null;
  /** True when more than one release is waiting, so the big window has more to show. */
  readonly spansReleases: boolean;
}

function versionParts(version: string): [number, number, number] | null {
  const parts = version.split(".").map(Number);
  return parts.length === 3 && parts.every(Number.isInteger)
    ? [parts[0]!, parts[1]!, parts[2]!]
    : null;
}

export function summarizeUpdate(state: DesktopUpdateState): UpdateSummary {
  const version = getDesktopUpdateDownloadedVersion(state);
  const notes = [...new Set(getWhatsNewItems(state, version))];
  const highlights = groupReleaseNotes(notes)
    .flatMap((group) => group.items)
    .slice(0, UPDATE_HIGHLIGHT_COUNT);
  const releaseNote = state.releaseNotes.find(
    (note) => note.version.trim().replace(/^v/i, "") === version,
  );
  const moreCount = Math.max(0, (releaseNote?.totalItems ?? notes.length) - highlights.length);
  const current = versionParts(state.currentVersion);
  const next = version ? versionParts(version) : null;
  const sameMinor = current && next && current[0] === next[0] && current[1] === next[1];
  const gap = sameMinor ? next[2] - current[2] : null;
  return {
    version,
    highlights,
    moreCount,
    updateCount: gap !== null && gap > 1 ? gap : null,
    spansReleases:
      version !== null &&
      compareSemverVersions(version, state.currentVersion) > 0 &&
      (!sameMinor || gap! > 1),
  };
}
