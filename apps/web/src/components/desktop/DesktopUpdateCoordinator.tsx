import { useAtomValue } from "@effect/atom-react";
import { useEffect, useRef } from "react";

import { sendUsageEvent } from "../../lib/usageAnalytics/sendUsageEvent";
import {
  useDesktopUpdateState,
  useUpdateDetailsStore,
  useUpdatePreferencesStore,
} from "../../state/desktopUpdate";
import { runningThreadCountAtom } from "../../state/threads";
import { installDesktopUpdate } from "../desktopUpdate.actions";
import {
  getDesktopUpdateDownloadedVersion,
  shouldInstallAutomatically,
} from "../desktopUpdate.logic";
import { UpdateDetailsDialogHost } from "./UpdateDetailsDialog";
import { UpdatedNoticeBar } from "./UpdatedNoticeBar";
import { fetchLatestReleaseWhatsNew, onWhatsNewPreviewRequested } from "./whatsNewPreview";

const AUTO_INSTALL_CHECK_MS = 30_000;

/**
 * Desktop only. Updates download and install on their own: when no AI work runs and the person
 * has been away a while, or when the app quits (the main process does that). This component shows
 * nothing by itself. The rail pill, the details window and the "Updated" bar do the talking.
 */
export function DesktopUpdateCoordinator() {
  const state = useDesktopUpdateState();
  const runningCount = useAtomValue(runningThreadCountAtom);
  const autoUpdateWhenSafe = useUpdatePreferencesStore((store) => store.autoUpdateWhenSafe);
  const showDetails = useUpdateDetailsStore((store) => store.show);
  const runningCountRef = useRef(runningCount);
  useEffect(() => {
    runningCountRef.current = runningCount;
  }, [runningCount]);

  // The main process installs on quit only while automatic updates are on.
  useEffect(() => {
    void Promise.resolve(window.desktopBridge?.setAutoInstall(autoUpdateWhenSafe)).catch(() => {});
  }, [autoUpdateWhenSafe]);

  // Settings > About > Preview opens the same window with the newest notes.
  useEffect(
    () =>
      onWhatsNewPreviewRequested(() => {
        void fetchLatestReleaseWhatsNew().then(({ version }) => {
          if (version) showDetails({ since: null, through: version });
        });
      }),
    [showDetails],
  );

  const downloadedVersion =
    state?.status === "downloaded" ? getDesktopUpdateDownloadedVersion(state) : null;
  const reportedVersionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!downloadedVersion || reportedVersionRef.current === downloadedVersion) return;
    reportedVersionRef.current = downloadedVersion;
    sendUsageEvent("update_downloaded");
  }, [downloadedVersion]);

  const lastInputAtRef = useRef(0);
  useEffect(() => {
    lastInputAtRef.current = Date.now();
    const markActive = () => {
      lastInputAtRef.current = Date.now();
    };
    const events = ["pointerdown", "keydown", "wheel"] as const;
    for (const name of events) window.addEventListener(name, markActive, { passive: true });
    return () => {
      for (const name of events) window.removeEventListener(name, markActive);
    };
  }, []);

  const installedVersionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!downloadedVersion || !autoUpdateWhenSafe) return;
    const timer = window.setInterval(() => {
      if (installedVersionRef.current === downloadedVersion) return;
      if (
        !shouldInstallAutomatically({
          enabled: true,
          hasDownloadedUpdate: true,
          runningCount: runningCountRef.current,
          idleMs: Date.now() - lastInputAtRef.current,
        })
      ) {
        return;
      }
      // One try per version. A failure turns the pill amber, and a click tries again.
      installedVersionRef.current = downloadedVersion;
      void installDesktopUpdate();
    }, AUTO_INSTALL_CHECK_MS);
    return () => window.clearInterval(timer);
  }, [downloadedVersion, autoUpdateWhenSafe]);

  return (
    <>
      <UpdateDetailsDialogHost />
      <UpdatedNoticeBar />
    </>
  );
}
