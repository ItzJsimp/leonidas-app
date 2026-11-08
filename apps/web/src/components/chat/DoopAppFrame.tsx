import type { EnvironmentId, ThreadId, TurnItemId } from "@t3tools/contracts";
import { useState, type ReactElement } from "react";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { readLocalApi } from "~/localApi";
import { useTurnItemDetail } from "~/state/queries";
import { readDoopPreview, type DoopPreview } from "./doopPreview";
import { ExpandedImageDialog } from "./ExpandedImageDialog";
import type { ExpandedImagePreview } from "./ExpandedImagePreview";

function Hint({ label, children }: { label: string; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipPopup>{label}</TooltipPopup>
    </Tooltip>
  );
}

function DoopDesign({
  frame,
  onExpand,
}: {
  frame: DoopPreview["frames"][number];
  onExpand: () => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <article className="min-w-0 overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex aspect-video max-h-48 w-full items-center justify-center bg-background">
        {frame.empty || failed || frame.imageUrl === null ? (
          <div className="flex flex-col items-center gap-2 p-4 text-center text-muted-foreground text-xs">
            <span>{frame.empty ? "Design in progress" : "Preview unavailable"}</span>
            <Hint label="View this design in your browser. It may have changed or been removed.">
              <a
                href={frame.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-6 items-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
              >
                View design
              </a>
            </Hint>
          </div>
        ) : (
          <Hint label="Enlarge this preview without leaving the chat">
            <button
              type="button"
              onClick={onExpand}
              className="flex size-full cursor-zoom-in items-center justify-center focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              aria-label={`Enlarge ${frame.name}`}
            >
              <img
                src={frame.imageUrl}
                alt={frame.name}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="size-full object-contain"
                onError={() => setFailed(true)}
              />
            </button>
          </Hint>
        )}
      </div>
      <div className="flex min-h-20 flex-col gap-1 border-border border-t p-3">
        <Hint label={`${frame.name}. Open this design in your browser.`}>
          <a
            href={frame.url}
            target="_blank"
            rel="noopener noreferrer"
            className="line-clamp-2 min-h-8 text-xs font-medium hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          >
            {frame.name}
          </a>
        </Hint>
        <Hint label="Design dimensions in pixels">
          <span tabIndex={0} className="text-muted-foreground text-xs">
            {frame.width} × {frame.height}
          </span>
        </Hint>
      </div>
    </article>
  );
}

export function DoopCanvasPreview({ preview }: { preview: DoopPreview }) {
  const [expanded, setExpanded] = useState<ExpandedImagePreview | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const desktop = typeof window !== "undefined" && window.desktopBridge !== undefined;
  const openApp = async () => {
    setLaunchError(null);
    try {
      const api = readLocalApi();
      if (!api) throw new Error("Link opening is unavailable.");
      // Doop accepts app launches, but its desktop handler has no canvas route yet.
      await api.shell.openExternal("doop://open");
    } catch {
      setLaunchError("Doop could not open. Install the app or use Browser.");
    }
  };
  return (
    <section
      aria-label="Doop designs"
      className="min-w-0 space-y-3 rounded-lg border border-border bg-card p-3"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-sm font-semibold">{preview.name}</h3>
          <Hint label="Number of designs in this tool result">
            <p tabIndex={0} className="text-muted-foreground text-xs">
              {preview.frameCount} {preview.frameCount === 1 ? "design" : "designs"} · Doop
            </p>
          </Hint>
        </div>
        <div className="flex items-center gap-2">
          <Hint label="Open this canvas in your browser">
            <Button
              size="sm"
              variant="outline"
              render={<a href={preview.url} target="_blank" rel="noopener noreferrer" />}
            >
              Browser
            </Button>
          </Hint>
          {desktop ? (
            <Hint label="Open Doop, then choose this canvas inside the app">
              <Button size="sm" onClick={() => void openApp()}>
                Open app
              </Button>
            </Hint>
          ) : null}
        </div>
      </header>
      {desktop ? (
        <p className="text-muted-foreground text-xs">
          Open app starts Doop. Choose this canvas inside the app.
        </p>
      ) : null}
      {launchError ? (
        <p role="alert" className="text-error-foreground text-xs">
          {launchError}
        </p>
      ) : null}
      {preview.frames.length ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-3">
          {preview.frames.map((frame, index) => (
            <DoopDesign
              key={`${frame.id}:${frame.imageUrl}`}
              frame={frame}
              onExpand={() =>
                setExpanded({
                  images: preview.frames
                    .filter((f) => f.imageUrl !== null && !f.empty)
                    .map((f) => ({ src: f.imageUrl, name: f.name })),
                  index: preview.frames
                    .slice(0, index)
                    .filter((f) => f.imageUrl !== null && !f.empty).length,
                })
              }
            />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">This canvas has no designs yet.</p>
      )}
      {preview.frameCount > preview.frames.length ? (
        <Hint label="See every design on this canvas in your browser">
          <a
            className="inline-block text-xs underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
            href={preview.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            View all {preview.frameCount} designs in browser
          </a>
        </Hint>
      ) : null}
      {expanded ? (
        <ExpandedImageDialog preview={expanded} onClose={() => setExpanded(null)} />
      ) : null}
    </section>
  );
}

export function DoopAppFrame(target: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  itemId: TurnItemId;
  revision: string;
}) {
  const detail = useTurnItemDetail(target);
  const item = detail.data?.item;
  const output =
    item?.type === "dynamic_tool"
      ? (item.output as { result?: { structuredContent?: unknown } })
      : undefined;
  const preview = readDoopPreview(output?.result?.structuredContent);
  return preview ? (
    <DoopCanvasPreview preview={preview} />
  ) : (
    <p className="p-3 text-muted-foreground text-xs">
      {detail.data ? "Doop preview unavailable." : "Loading Doop designs…"}
    </p>
  );
}
