import { useAtomValue } from "@effect/atom-react";
import { Atom } from "effect/reactivity";
import { lazy, Suspense, useEffect, useRef, useState } from "react";

import { appAtomRegistry } from "../../rpc/atomRegistry";
import { ArrowLeftIcon, ArrowUpRightIcon } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
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
import {
  fetchReleaseHistory,
  formatReleaseCredits,
  formatFriendlyReleaseDate,
  type ReleaseHistoryEntry,
} from "./releaseHistory";

const ReleaseArticle = lazy(() =>
  import("./ReleaseArticleView").then((module) => ({ default: module.ReleaseArticle })),
);

const releaseHistoryDialogOpenAtom = Atom.make<boolean>(false).pipe(
  Atom.keepAlive,
  Atom.withLabel("release-history:dialog-open"),
);

export function openReleaseHistoryDialog(): void {
  appAtomRegistry.set(releaseHistoryDialogOpenAtom, true);
}

function closeReleaseHistoryDialog(): void {
  appAtomRegistry.set(releaseHistoryDialogOpenAtom, false);
}

/** Load notes only when opened, with bounded pages and a retry for network failures. */
function ReleaseHistoryDialog({ onClose }: { readonly onClose?: () => void }) {
  const [selected, setSelected] = useState<ReleaseHistoryEntry | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const feedScroll = useRef(0);
  const selectedVersion = useRef<string | null>(null);
  const [entries, setEntries] = useState<ReleaseHistoryEntry[]>([]);
  const [request, setRequest] = useState({ page: 1, attempt: 0 });
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openArticle = (entry: ReleaseHistoryEntry) => {
    if (!selected)
      feedScroll.current =
        panelRef.current?.closest("[data-slot=scroll-area-viewport]")?.scrollTop ?? 0;
    selectedVersion.current = entry.version;
    setSelected(entry);
  };

  useEffect(() => {
    const viewport = panelRef.current?.closest("[data-slot=scroll-area-viewport]");
    if (viewport) viewport.scrollTop = selected ? 0 : feedScroll.current;
    if (!selected && selectedVersion.current) {
      panelRef.current
        ?.querySelector<HTMLButtonElement>(`[data-release-version="${selectedVersion.current}"]`)
        ?.focus({ preventScroll: true });
    }
  }, [selected, panelRef, feedScroll, selectedVersion]);

  const handleClose = () => {
    closeReleaseHistoryDialog();
    onClose?.();
  };

  useEffect(() => {
    const controller = new AbortController();
    void fetchReleaseHistory(request.page, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setEntries((current) => [
          ...current,
          ...result.entries.filter(
            (entry) => !current.some((old) => old.version === entry.version),
          ),
        ]);
        setHasMore(result.hasMore && request.page < 10);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load the update history. Select Retry.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [request]);

  return (
    <Dialog open onOpenChange={(open) => !open && handleClose()}>
      <DialogPopup className={selected ? "max-w-4xl" : "max-w-3xl"} bottomStickOnMobile={false}>
        <DialogHeader>
          {selected ? (
            <div className="mb-2">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                      <ArrowLeftIcon aria-hidden className="size-4" /> All updates
                    </Button>
                  }
                />
                <TooltipPopup>Go back to all updates</TooltipPopup>
              </Tooltip>
            </div>
          ) : null}
          <DialogTitle>{selected ? selected.article.title : "Update history"}</DialogTitle>
          <DialogDescription>
            {selected
              ? `Version ${selected.version} · ${formatFriendlyReleaseDate(selected.publishedAt)}`
              : "See what is new and what we fixed in each update."}
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="max-h-[65dvh]">
          <div ref={panelRef} className="space-y-8" aria-busy={loading}>
            {selected ? (
              <div className="grid gap-6 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-8">
                <nav
                  aria-label="Update versions"
                  className="sticky top-0 hidden self-start sm:block"
                >
                  <div className="space-y-1 border-r border-border pr-4">
                    {entries.map((entry) => (
                      <Tooltip key={entry.version}>
                        <TooltipTrigger
                          render={
                            <button
                              type="button"
                              aria-current={selected.version === entry.version ? "page" : undefined}
                              onClick={() => openArticle(entry)}
                              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs tabular-nums text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring aria-[current=page]:bg-muted aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
                            />
                          }
                        >
                          {entry.version}
                        </TooltipTrigger>
                        <TooltipPopup>Read version {entry.version}</TooltipPopup>
                      </Tooltip>
                    ))}
                  </div>
                </nav>
                <Suspense
                  fallback={
                    <p role="status" className="text-sm text-muted-foreground">
                      Loading article…
                    </p>
                  }
                >
                  <ReleaseArticle key={selected.version} entry={selected} />
                </Suspense>
              </div>
            ) : null}

            {!selected
              ? entries.map((entry, index) => (
                  <article
                    key={entry.version}
                    className="overflow-hidden rounded-xl border border-border"
                  >
                    {entry.article.image?.src ? (
                      <img
                        src={entry.article.image.src}
                        alt={entry.article.image.alt}
                        loading="lazy"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        className="aspect-video w-full bg-muted object-contain"
                        onError={(event) => {
                          event.currentTarget.hidden = true;
                        }}
                      />
                    ) : null}
                    <div className="space-y-3 p-5 sm:p-6">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-medium tabular-nums">Version {entry.version}</span>
                        {index === 0 ? (
                          <span className="font-medium text-foreground">Latest</span>
                        ) : null}
                        {entry.publishedAt ? (
                          <time dateTime={entry.publishedAt}>
                            {formatFriendlyReleaseDate(entry.publishedAt)}
                          </time>
                        ) : null}
                      </div>
                      <h3 className="text-xl font-semibold tracking-tight">
                        {entry.article.title}
                      </h3>
                      <p className="max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
                        {entry.article.summary}
                      </p>
                      <div className="flex items-center justify-between gap-3 pt-1">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="outline"
                                size="sm"
                                data-release-version={entry.version}
                                onClick={() => openArticle(entry)}
                              >
                                Read update <ArrowUpRightIcon aria-hidden className="size-3.5" />
                              </Button>
                            }
                          />
                          <TooltipPopup>Read all changes in version {entry.version}</TooltipPopup>
                        </Tooltip>
                        <span className="text-xs text-muted-foreground">
                          {entry.notes.length} {entry.notes.length === 1 ? "change" : "changes"}
                        </span>
                      </div>
                    </div>
                  </article>
                ))
              : null}

            {!selected && loading ? (
              <p role="status" className="text-sm text-muted-foreground">
                Loading updates…
              </p>
            ) : null}

            {!selected && error ? (
              <div className="space-y-2">
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setLoading(true);
                    setError(null);
                    setRequest((current) => ({ ...current, attempt: current.attempt + 1 }));
                  }}
                >
                  Retry
                </Button>
              </div>
            ) : null}

            {!selected && !loading && !error && entries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No updates yet. Check again later.</p>
            ) : null}

            {!selected && !loading && !error && !hasMore && request.page >= 10 ? (
              <Button
                variant="outline"
                size="sm"
                render={
                  <a
                    href="https://github.com/ItzJsimp/leonidas-app/releases"
                    target="_blank"
                    rel="noopener noreferrer"
                  />
                }
              >
                See earlier updates on GitHub
              </Button>
            ) : null}
            {!selected && !loading && !error && hasMore ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setLoading(true);
                  setError(null);
                  setRequest((current) => ({ ...current, page: current.page + 1 }));
                }}
              >
                Show older updates
              </Button>
            ) : null}
          </div>
        </DialogPanel>
        <DialogFooter className="sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {selected
              ? formatReleaseCredits(selected.meta)
                ? `Built by ${formatReleaseCredits(selected.meta)}`
                : "Leonidas"
              : "Versions below 1.0 are test versions."}
          </p>
          <Button variant="ghost" onClick={handleClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

export function ReleaseHistoryDialogHost() {
  const isOpen = useAtomValue(releaseHistoryDialogOpenAtom);
  if (!isOpen) return null;
  return <ReleaseHistoryDialog />;
}
