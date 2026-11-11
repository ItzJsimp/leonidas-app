import { compareSemverVersions } from "@t3tools/shared/semver";
import { XIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { APP_VERSION } from "../../branding";
import { useUpdateDetailsStore, useUpdatePreferencesStore } from "../../state/desktopUpdate";
import { fetchReleaseEntry } from "./releaseHistory";

interface UpdatedNotice {
  readonly version: string;
  readonly since: string;
  readonly firstNote: string | null;
}

/**
 * One slim line after an update installed: "Updated to X. What's new." It shows only for notable
 * updates (or all, if the person chose that). Small fixes leave no mark.
 */
export function UpdatedNoticeBar() {
  const level = useUpdatePreferencesStore((store) => store.updateNotice);
  const showDetails = useUpdateDetailsStore((store) => store.show);
  // Read the stored version once, before the effect writes the running one.
  const [lastRun] = useState(() => useUpdatePreferencesStore.getState().lastRunVersion);
  const [notice, setNotice] = useState<UpdatedNotice | null>(null);

  useEffect(() => {
    useUpdatePreferencesStore.getState().setLastRunVersion(APP_VERSION);
    if (!lastRun || level === "never" || compareSemverVersions(APP_VERSION, lastRun) <= 0) return;
    const controller = new AbortController();
    fetchReleaseEntry(APP_VERSION, controller.signal)
      .then((entry) => {
        const notableSince = entry.meta?.notableSince;
        const worthy =
          level === "all" ||
          (notableSince !== undefined && compareSemverVersions(notableSince, lastRun) > 0);
        if (worthy && !controller.signal.aborted) {
          setNotice({ version: APP_VERSION, since: lastRun, firstNote: entry.notes[0] ?? null });
        }
      })
      .catch(() => {
        // No notes, no bar. The update history still has them.
      });
    return () => controller.abort();
  }, [lastRun, level]);

  if (!notice) return null;
  return (
    <div
      role="status"
      className="fixed top-[calc(var(--workspace-topbar-height)+0.5rem)] left-1/2 z-40 flex max-w-[min(44rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-card py-1.5 ps-4 pe-2 text-xs text-card-foreground shadow-sm"
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-state" />
      <b className="shrink-0 font-semibold">Updated to {notice.version}</b>
      {notice.firstNote ? (
        <span className="min-w-0 truncate text-muted-foreground">{notice.firstNote}</span>
      ) : null}
      <button
        type="button"
        className="shrink-0 rounded-sm text-state-text underline underline-offset-4 outline-hidden ring-ring focus-visible:ring-2 focus-visible:ring-inset"
        onClick={() => {
          showDetails({ since: notice.since, through: notice.version });
          setNotice(null);
        }}
      >
        What's new
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground outline-hidden ring-ring transition-colors hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-inset"
        onClick={() => setNotice(null)}
      >
        <XIcon aria-hidden className="size-3.5" />
      </button>
    </div>
  );
}
