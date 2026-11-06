import { sendUsageEvent } from "../../lib/usageAnalytics/sendUsageEvent";
import { useAtomValue } from "@effect/atom-react";
import { useEffect, useRef, useState } from "react";

import { ensureLocalApi } from "../../localApi";
import { useDesktopUpdateState, useUpdateWhenSafeStore } from "../../state/desktopUpdate";
import { runningThreadCountAtom } from "../../state/threads";
import {
  getDesktopUpdateActionError,
  getDesktopUpdateDownloadedVersion,
  getDesktopUpdateInstallConfirmationMessage,
  getWhatsNewItems,
  resolveUpdateWhenSafeAction,
  shouldInstallWhenIdle,
} from "../desktopUpdate.logic";
import {
  showDesktopUpdateDownloadedToast,
  showDesktopUpdateWaitingToast,
} from "../desktopUpdate.toast";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { playUpdateReadySound } from "./updateReadySound";
import { LeonidasWhatsNewDialog } from "./LeonidasWhatsNewDialog";
import { DesktopUpdateProgress } from "./DesktopUpdateProgress";
import { fetchLatestReleaseWhatsNew, onWhatsNewPreviewRequested } from "./whatsNewPreview";

const INSTALLER_URL =
  "https://github.com/ItzJsimp/leonidas-app/releases/latest/download/Leonidas-Setup.exe";
const INSTALL_FALLBACK = "Check your internet connection. Or download the latest installer.";

function toastInstallError(description: string) {
  const toastId = toastManager.add(
    stackedThreadToast({
      type: "error",
      title: "Could not install the update",
      description,
      actionProps: {
        children: "Try again",
        onClick: () => {
          toastManager.close(toastId);
          void installUpdate();
        },
      },
      data: {
        secondaryActionProps: {
          children: "Download installer",
          onClick: () => {
            toastManager.close(toastId);
            void ensureLocalApi().shell.openExternal(INSTALLER_URL);
          },
        },
      },
    }),
  );
}

async function installUpdate(): Promise<void> {
  try {
    const result = await window.desktopBridge?.installUpdate();
    const actionError = result ? getDesktopUpdateActionError(result) : null;
    if (actionError) toastInstallError(actionError);
  } catch (error) {
    toastInstallError(error instanceof Error ? error.message : INSTALL_FALLBACK);
  }
}

/**
 * Desktop only. Shows the "Update ready" toast once per downloaded version and
 * runs "Update when safe": it installs the moment no agent thread is running.
 */
export function DesktopUpdateCoordinator() {
  const state = useDesktopUpdateState();
  const runningCount = useAtomValue(runningThreadCountAtom);
  const updateWhenSafe = useUpdateWhenSafeStore((store) => store.updateWhenSafe);
  const autoUpdateWhenSafe = useUpdateWhenSafeStore((store) => store.autoUpdateWhenSafe);
  const setAutoUpdateWhenSafe = useUpdateWhenSafeStore((store) => store.setAutoUpdateWhenSafe);
  const setUpdateWhenSafe = useUpdateWhenSafeStore((store) => store.setUpdateWhenSafe);
  const runningCountRef = useRef(runningCount);
  runningCountRef.current = runningCount;
  const toastedVersionRef = useRef<string | null>(null);
  const [whatsNew, setWhatsNew] = useState<{
    readonly version: string;
    readonly items: ReadonlyArray<string>;
    readonly actions?: { readonly onRestartNow: () => void; readonly onUpdateWhenSafe: () => void };
  } | null>(null);

  // Settings > About "Preview": same popup, real latest-release bullets, no install buttons.
  useEffect(
    () =>
      onWhatsNewPreviewRequested(() => {
        void fetchLatestReleaseWhatsNew().then(({ version, items }) =>
          setWhatsNew({ version, items }),
        );
      }),
    [],
  );

  const downloadedVersion =
    state?.status === "downloaded" ? getDesktopUpdateDownloadedVersion(state) : null;
  useEffect(() => {
    const bridge = window.desktopBridge;
    if (!bridge || !state || !downloadedVersion) return;
    if (toastedVersionRef.current === downloadedVersion) return;
    toastedVersionRef.current = downloadedVersion;
    sendUsageEvent("update_downloaded");
    const actions = {
      onRestartNow: () => {
        void (async () => {
          if (runningCountRef.current > 0) {
            try {
              const confirmed = await ensureLocalApi().dialogs.confirm(
                getDesktopUpdateInstallConfirmationMessage(state, runningCountRef.current),
              );
              if (!confirmed) return;
            } catch (error) {
              toastInstallError(
                error instanceof Error ? error.message : "Could not confirm the update. Try again.",
              );
              return;
            }
          }
          await installUpdate();
        })();
      },
      onUpdateWhenSafe: () => setUpdateWhenSafe(true),
      runningCount: runningCountRef.current,
    };
    const items = getWhatsNewItems(state, downloadedVersion);
    if (items.length === 0) {
      showDesktopUpdateDownloadedToast(bridge, state, actions);
      return;
    }
    playUpdateReadySound();
    setWhatsNew({ version: downloadedVersion, items, actions });
    // `state` only feeds the toast copy; the version is the once-per-update key.
  }, [downloadedVersion, setUpdateWhenSafe]);

  const whenSafeAction = resolveUpdateWhenSafeAction(
    runningCount,
    downloadedVersion !== null && (updateWhenSafe || autoUpdateWhenSafe),
  );
  const setDraining = useUpdateWhenSafeStore((store) => store.setDraining);
  useEffect(() => {
    setDraining(whenSafeAction === "wait");
    return () => setDraining(false);
  }, [whenSafeAction, setDraining]);
  const installingVersionRef = useRef<string | null>(null);
  const waitToastedVersionRef = useRef<string | null>(null);
  useEffect(() => {
    if (whenSafeAction === "install") {
      if (installingVersionRef.current === downloadedVersion) return;
      installingVersionRef.current = downloadedVersion;
      setUpdateWhenSafe(false);
      void installUpdate();
      return;
    }
    if (whenSafeAction !== "wait") return;
    // The periodic update check flips the state off and on "downloaded"; announce once per version.
    if (waitToastedVersionRef.current === downloadedVersion) return;
    waitToastedVersionRef.current = downloadedVersion;
    const toastId = showDesktopUpdateWaitingToast(
      () => {
        setUpdateWhenSafe(false);
        if (autoUpdateWhenSafe) setAutoUpdateWhenSafe(false);
      },
      autoUpdateWhenSafe ? "Turn off automatic updates" : "Cancel",
    );
    return () => toastManager.close(toastId);
  }, [
    whenSafeAction,
    setUpdateWhenSafe,
    downloadedVersion,
    autoUpdateWhenSafe,
    setAutoUpdateWhenSafe,
  ]);

  // A user who chose Cancel, or never answered, must not stay on an old version for days:
  // after a long idle period with no running AI work, install the downloaded update.
  const lastInputAtRef = useRef(Date.now());
  const idleInstallVersionRef = useRef<string | null>(null);
  useEffect(() => {
    const markActive = () => {
      lastInputAtRef.current = Date.now();
    };
    const events = ["pointerdown", "keydown", "wheel"] as const;
    for (const name of events) window.addEventListener(name, markActive, { passive: true });
    return () => {
      for (const name of events) window.removeEventListener(name, markActive);
    };
  }, []);
  useEffect(() => {
    if (!downloadedVersion) return;
    const timer = window.setInterval(() => {
      if (idleInstallVersionRef.current === downloadedVersion) return;
      if (
        !shouldInstallWhenIdle(runningCountRef.current, Date.now() - lastInputAtRef.current, true)
      ) {
        return;
      }
      idleInstallVersionRef.current = downloadedVersion;
      void installUpdate();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [downloadedVersion]);

  return (
    <>
      <DesktopUpdateProgress state={state} />
      {whatsNew ? (
        <LeonidasWhatsNewDialog
          key={whatsNew.version}
          version={whatsNew.version}
          items={whatsNew.items}
          onRestartNow={whatsNew.actions?.onRestartNow}
          onUpdateWhenSafe={whatsNew.actions?.onUpdateWhenSafe}
          onClose={() => setWhatsNew(null)}
        />
      ) : null}
    </>
  );
}
