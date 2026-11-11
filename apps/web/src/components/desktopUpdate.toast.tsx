import type { DesktopBridge, DesktopUpdateState } from "@t3tools/contracts";
import { ArrowRightIcon } from "lucide-react";

import {
  getDesktopUpdateDownloadedVersion,
  getDesktopUpdateReleaseUrl,
  UPDATE_WHEN_SAFE_WAITING_LABEL,
} from "./desktopUpdate.logic";
import { toastManager } from "./ui/toast";
import { playUpdateReadySound } from "./desktop/updateReadySound";
import { userErrorToastFields } from "~/lib/userErrorToast";

type DesktopUpdateShell = Pick<DesktopBridge, "openExternal">;

export async function openDesktopUpdateReleaseNotes(
  shell: DesktopUpdateShell | undefined,
  releaseUrl: string,
): Promise<void> {
  try {
    if (shell && (await shell.openExternal(releaseUrl))) return;
  } catch {}
  toastManager.add({ type: "error", title: "Could not open the update notes. Try again." });
}

function ReleaseNotesLink({
  shell,
  releaseUrl,
}: {
  shell: DesktopUpdateShell;
  releaseUrl: string;
}) {
  return (
    <button
      className="ml-2 inline cursor-pointer text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground"
      onClick={() => {
        void openDesktopUpdateReleaseNotes(shell, releaseUrl);
      }}
      type="button"
    >
      Read the update notes
      <ArrowRightIcon
        aria-hidden
        className="ml-1 inline size-3 -rotate-45 align-[-0.125em]"
        strokeWidth={2.25}
      />
    </button>
  );
}

export function showDesktopUpdateDownloadedToast(
  shell: DesktopUpdateShell,
  state: DesktopUpdateState,
  actions: {
    readonly onRestartNow: () => void;
    readonly onUpdateWhenSafe: () => void;
    /** Chats running now. When above 0, "Update when idle" is the primary action. */
    readonly runningCount?: number;
  },
): void {
  playUpdateReadySound();
  const idleFirst = (actions.runningCount ?? 0) > 0;
  const restart = { label: "Restart now", run: actions.onRestartNow };
  const idle = {
    label: idleFirst ? "Update when the AI is done" : "Update when it is safe",
    run: actions.onUpdateWhenSafe,
  };
  const [primary, secondary] = idleFirst ? [idle, restart] : [restart, idle];
  const version = getDesktopUpdateDownloadedVersion(state);
  const releaseUrl = getDesktopUpdateReleaseUrl(version);
  const toastId = toastManager.add({
    type: "success",
    title: "Update ready",
    description: (
      <>
        <span>Leonidas{version ? ` ${version}` : ""} is ready to install.</span>
        {releaseUrl ? <ReleaseNotesLink releaseUrl={releaseUrl} shell={shell} /> : null}
      </>
    ),
    timeout: 0,
    actionProps: {
      children: primary.label,
      onClick: () => {
        toastManager.close(toastId);
        primary.run();
      },
    },
    data: {
      actionLayout: "stacked-end",
      secondaryActionProps: {
        children: secondary.label,
        onClick: () => {
          toastManager.close(toastId);
          secondary.run();
        },
      },
    },
  });
}

/**
 * Shown once while the update waits on running replies; returns the id so the caller can
 * close it. It auto-dismisses because the sidebar update pill carries the lasting waiting state.
 */
export function showDesktopUpdateWaitingToast(onCancel: () => void, cancelLabel = "Cancel") {
  return toastManager.add({
    type: "info",
    title: UPDATE_WHEN_SAFE_WAITING_LABEL,
    timeout: 6000,
    actionProps: { children: cancelLabel, onClick: onCancel },
  });
}

/** The updater can publish its terminal state after the check RPC resolves. */
export async function checkForDesktopUpdateWithFeedback(
  shell: Pick<DesktopBridge, "checkForUpdate" | "onUpdateState">,
) {
  let finished = false;
  let unsubscribe = () => {};
  const finish = (state: DesktopUpdateState) => {
    if (finished || state.status === "checking" || state.status === "idle") return;
    finished = true;
    unsubscribe();
    if (state.status === "up-to-date") {
      toastManager.add({
        type: "success",
        title: "You're up to date",
        description: `Leonidas ${state.currentVersion} is the newest version.`,
      });
    } else if (state.status === "error") {
      toastManager.add({
        type: "error",
        title: "Could not check for updates",
        ...userErrorToastFields(state.message ?? "Update check failed.", { area: "update" }),
      });
    }
  };
  unsubscribe = shell.onUpdateState(finish);
  if (finished) unsubscribe();
  try {
    const result = await shell.checkForUpdate();
    if (result.checked) finish(result.state);
    else {
      finished = true;
      unsubscribe();
    }
    return result;
  } catch (error) {
    finished = true;
    unsubscribe();
    throw error;
  }
}
