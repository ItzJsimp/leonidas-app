import { compareSemverVersions } from "@t3tools/shared/semver";
import { useAtomValue } from "@effect/atom-react";
import { useEffect, useState } from "react";

import {
  useDesktopUpdateState,
  useUpdateDetailsStore,
  type UpdateDetailsRange,
} from "../../state/desktopUpdate";
import { runningThreadCountAtom } from "../../state/threads";
import { installDesktopUpdate } from "../desktopUpdate.actions";
import { getDesktopUpdateDownloadedVersion, groupReleaseNotes } from "../desktopUpdate.logic";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { fetchReleaseHistory, type ReleaseHistoryEntry } from "./releaseHistory";
import { openReleaseHistoryDialog } from "./ReleaseHistoryDialog";

const MAX_PAGES = 3;
const NEWEST_COUNT = 5;

type Load =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "ready"; readonly entries: ReadonlyArray<ReleaseHistoryEntry> };

/** Releases after `since` and up to `through`, newest first. With no `since`, the newest few. */
export async function loadUpdateReleases(
  range: UpdateDetailsRange,
  signal: AbortSignal,
): Promise<ReadonlyArray<ReleaseHistoryEntry>> {
  const found: ReleaseHistoryEntry[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { entries, hasMore } = await fetchReleaseHistory(page, signal);
    for (const entry of entries) {
      if (compareSemverVersions(entry.version, range.through) > 0) continue;
      if (range.since && compareSemverVersions(entry.version, range.since) <= 0) return found;
      found.push(entry);
      if (!range.since && found.length >= NEWEST_COUNT) return found;
    }
    if (!hasMore) break;
  }
  return found;
}

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date)
    : "";
}

function ReleaseSection({
  entry,
  ready,
}: {
  readonly entry: ReleaseHistoryEntry;
  readonly ready: boolean;
}) {
  const groups = groupReleaseNotes(entry.notes);
  return (
    <section className="border-b border-border py-4 first:pt-0 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold tabular-nums">
          {entry.version}
          {ready ? (
            <span className="rounded-full bg-state px-2 py-px text-3xs font-medium text-state-foreground">
              Ready
            </span>
          ) : null}
        </h3>
        <span className="text-xs text-muted-foreground">{formatShortDate(entry.publishedAt)}</span>
      </div>
      {entry.article.hasIntroduction ? (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {entry.article.summary}
        </p>
      ) : null}
      {groups.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Internal improvements only.</p>
      ) : (
        groups.map((group) => (
          <div key={group.title}>
            <h4 className="mt-3 mb-1.5 text-3xs font-medium tracking-wider text-muted-foreground uppercase">
              {group.title}
            </h4>
            <ul className="list-disc space-y-1.5 ps-4 text-sm leading-relaxed marker:text-muted-foreground/60">
              {group.items.map((item) => (
                <li key={item} className="break-words ps-1">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

function UpdateDetailsDialog({
  range,
  onClose,
}: {
  readonly range: UpdateDetailsRange;
  readonly onClose: () => void;
}) {
  const state = useDesktopUpdateState();
  const runningCount = useAtomValue(runningThreadCountAtom);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    loadUpdateReleases(range, controller.signal)
      .then((entries) => {
        if (!controller.signal.aborted) setLoad({ status: "ready", entries });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ status: "error" });
      });
    return () => controller.abort();
  }, [range]);

  const readyVersion =
    state?.status === "downloaded" ? getDesktopUpdateDownloadedVersion(state) : null;
  const canRestart = readyVersion !== null && readyVersion === range.through;
  const entries = load.status === "ready" ? load.entries : [];
  const changeCount = entries.reduce((sum, entry) => sum + entry.notes.length, 0);
  const subtitle =
    load.status !== "ready"
      ? "Loading the notes"
      : `${entries.length} ${entries.length === 1 ? "update" : "updates"}${
          range.since ? ` since ${range.since}` : ""
        } · ${changeCount} ${changeCount === 1 ? "change" : "changes"}`;

  const restart = () => {
    if (runningCount > 0) {
      setConfirming(true);
      return;
    }
    onClose();
    void installDesktopUpdate();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPopup className="max-w-3xl" bottomStickOnMobile={false}>
        <DialogHeader>
          <DialogTitle>What's new in Leonidas</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>
        <DialogPanel className="max-h-[60dvh]">
          {load.status === "loading" ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading the notes…
            </p>
          ) : load.status === "error" ? (
            <div className="flex flex-wrap items-center gap-3">
              <p role="status" className="text-sm text-muted-foreground">
                The notes could not load. Check your connection.
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  // A new range object runs the load effect again.
                  setLoad({ status: "loading" });
                  useUpdateDetailsStore.getState().show({ ...range });
                }}
              >
                Try again
              </Button>
            </div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No notes were published for this update.
            </p>
          ) : (
            entries.map((entry) => (
              <ReleaseSection
                key={entry.version}
                entry={entry}
                ready={canRestart && entry.version === range.through}
              />
            ))
          )}
        </DialogPanel>
        <DialogFooter className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            className="w-fit rounded-sm text-xs text-state-text underline underline-offset-4 outline-hidden ring-ring focus-visible:ring-2 focus-visible:ring-inset"
            onClick={() => {
              onClose();
              openReleaseHistoryDialog();
            }}
          >
            Update history
          </button>
          {confirming ? (
            <div className="flex flex-wrap items-center justify-end gap-2" role="alertdialog">
              <p className="text-xs text-muted-foreground">
                {runningCount === 1
                  ? "1 chat is still working. It stops if you restart now."
                  : `${runningCount} chats are still working. They stop if you restart now.`}
              </p>
              <Button
                variant="ghost"
                onClick={() => {
                  onClose();
                  void installDesktopUpdate();
                }}
              >
                Restart anyway
              </Button>
              <Button onClick={onClose}>Keep waiting</Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {canRestart ? (
                <p className="text-xs text-muted-foreground">
                  Installs by itself when your AI is done, or when you quit.
                </p>
              ) : null}
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
              {canRestart ? (
                <Button variant="outline" onClick={restart}>
                  Restart now
                </Button>
              ) : null}
            </div>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

/** Mounted once. Opens only when a person asks for the full notes. */
export function UpdateDetailsDialogHost() {
  const range = useUpdateDetailsStore((store) => store.range);
  const close = useUpdateDetailsStore((store) => store.close);
  if (!range) return null;
  return (
    <UpdateDetailsDialog
      key={`${range.since ?? ""}-${range.through}`}
      range={range}
      onClose={close}
    />
  );
}
