import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { StoredFile } from "@t3tools/contracts";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { FolderOpenIcon, RefreshCwIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { toastManager } from "~/components/ui/toast";
import { observeResize } from "~/lib/observeResize";
import { useAtomCommand } from "~/state/use-atom-command";

import { RailWindow, WindowEmpty, WindowError } from "../../twoState/RailWindow";
import { Tip } from "../../twoState/Tip";
import { DeleteFileDialog } from "./DeleteFileDialog";
import { FilePreviewPane } from "./FilePreviewPane";
import { FileRow, ImageTile } from "./FileItems";
import { deleteFailureText, emptyFilesText, filesTab, filesTabs, splitByKind } from "./files.logic";
import { filesDelete } from "./state";
import { useFilesList } from "./useFilesList";

/** Below this pane width the list and the preview take turns. */
const NARROW_PANE = 720;
const GRID = "grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-1";

/**
 * The Files window: everything the app keeps for your chats (pictures, screenshots, documents,
 * rendered pages), newest first, with a preview beside the list.
 */
export function FilesWindow() {
  const search = useSearch({ strict: false }) as { readonly tab?: unknown };
  const tab = filesTab(typeof search.tab === "string" ? search.tab : undefined);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const list = useFilesList(tab, query);
  const runDelete = useAtomCommand(filesDelete, { reportFailure: false });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [asking, setAsking] = useState<StoredFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const [frame, setFrame] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!frame) return;
    return observeResize(frame, (entries) => {
      const width = entries.at(-1)?.contentRect.width;
      if (width !== undefined) setNarrow(width < NARROW_PANE);
    });
  }, [frame]);

  const selected = list.files.find((file) => file.id === selectedId);
  const { images, documents } = useMemo(() => splitByKind(list.files), [list.files]);
  const showPreview = selected !== undefined && (!narrow || previewOpen);
  const showList = !narrow || !showPreview;
  const searching = query.trim() !== "";

  const openChat = (file: StoredFile) => {
    if (!file.thread || !list.environmentId) return;
    void navigate({
      to: "/$environmentId/$threadId",
      params: { environmentId: list.environmentId, threadId: file.thread.id },
    });
  };

  const confirmDelete = async () => {
    const file = asking;
    if (!file || !list.environmentId) return;
    setDeleting(true);
    const result = await runDelete({
      environmentId: list.environmentId,
      input: { attachmentId: file.id },
    });
    setDeleting(false);
    if (result._tag === "Failure") {
      const error = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: "Could not delete the file",
        description: deleteFailureText(error, file),
      });
      return;
    }
    list.remove(file);
    setAsking(null);
    setSelectedId(null);
    setPreviewOpen(false);
  };

  const actions = (
    <>
      <div data-window-search className="w-48 max-[727px]:w-full sm:w-56">
        <Input
          type="search"
          size="compact"
          aria-label="Search files"
          placeholder="Search files and chats"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <Tip text="Read the files again">
        <Button size="xs" variant="ghost-muted" onClick={list.reload}>
          <RefreshCwIcon aria-hidden />
          Refresh
        </Button>
      </Tip>
    </>
  );

  const select = (file: StoredFile) => {
    setSelectedId(file.id);
    setPreviewOpen(true);
  };
  const tile = (file: StoredFile) => (
    <ImageTile
      key={file.id}
      file={file}
      environmentId={list.environmentId}
      selected={file.id === selectedId}
      onSelect={() => select(file)}
    />
  );
  const row = (file: StoredFile) => (
    <li key={file.id}>
      <FileRow file={file} selected={file.id === selectedId} onSelect={() => select(file)} />
    </li>
  );

  return (
    <RailWindow title="Files" tabs={filesTabs(list.counts)} actions={actions}>
      {list.status === "loading" ? (
        <div role="status" aria-label="Loading your files" className={GRID}>
          {Array.from({ length: 12 }, (_, key) => (
            <Skeleton key={key} className="aspect-square w-full" shape="card" />
          ))}
        </div>
      ) : list.status === "error" ? (
        <WindowError
          message="Your files did not load. Check that Leonidas is running, then try again."
          onRetry={list.reload}
        />
      ) : list.files.length === 0 ? (
        <div className="flex flex-col items-center gap-3">
          <WindowEmpty
            icon={FolderOpenIcon}
            {...emptyFilesText(tab, query)}
            {...(searching ? {} : { action: { label: "Start a chat", to: "/" } })}
          />
          {/* A search reads a limited run of files per request, so older files may still match. */}
          {list.hasMore ? (
            <Button
              size="sm"
              variant="outline"
              disabled={list.loadingMore}
              onClick={() => void list.loadMore()}
            >
              {list.loadingMore ? "Searching" : "Search older files"}
            </Button>
          ) : null}
        </div>
      ) : (
        // The window body pads its content; the two panes sit flush against its edges.
        <div
          ref={setFrame}
          onKeyDown={(event) => {
            if (event.key === "Escape" && narrow && showPreview) setPreviewOpen(false);
          }}
          className="-m-4 flex h-[calc(100%+2rem)] min-h-0"
        >
          {showList ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <p className="mb-3 text-xs text-muted-foreground" role="status">
                  Newest first
                  {searching ? ` · matches for "${query.trim()}"` : ""}
                </p>
                {tab !== "documents" && images.length > 0 ? (
                  <section aria-label="Images" className="mb-6">
                    {tab === "all" ? (
                      <h2 className="mb-2 text-xs font-medium text-muted-foreground">Images</h2>
                    ) : null}
                    <div className={GRID}>{images.map(tile)}</div>
                  </section>
                ) : null}
                {tab !== "images" && documents.length > 0 ? (
                  <section aria-label="Documents">
                    {tab === "all" ? (
                      <h2 className="mb-2 text-xs font-medium text-muted-foreground">Documents</h2>
                    ) : null}
                    <ul className="flex flex-col gap-0.5">{documents.map(row)}</ul>
                  </section>
                ) : null}
                {list.error ? (
                  <p role="alert" className="mt-4 text-sm text-destructive-foreground">
                    More files did not load. {list.error}
                  </p>
                ) : null}
                {list.hasMore ? (
                  <div className="mt-6 flex justify-center">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={list.loadingMore}
                      onClick={() => void list.loadMore()}
                    >
                      {list.loadingMore ? "Loading" : "Show more files"}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
          {showPreview ? (
            <div
              className={
                narrow
                  ? "flex min-h-0 min-w-0 flex-1"
                  : "flex min-h-0 w-[min(34rem,55%)] shrink-0 border-l border-border"
              }
            >
              <FilePreviewPane
                file={selected}
                environmentId={list.environmentId}
                onBack={narrow ? () => setPreviewOpen(false) : null}
                onOpenChat={() => openChat(selected)}
                onDelete={() => setAsking(selected)}
              />
            </div>
          ) : !narrow ? (
            <div className="flex min-h-0 w-[min(34rem,55%)] shrink-0 items-center justify-center border-l border-border px-6 text-center">
              <p className="text-sm text-muted-foreground">Pick a file to preview it here.</p>
            </div>
          ) : null}
        </div>
      )}
      <DeleteFileDialog
        file={asking}
        busy={deleting}
        onCancel={() => setAsking(null)}
        onConfirm={() => void confirmDelete()}
        onOpenChat={() => {
          if (asking) openChat(asking);
          setAsking(null);
        }}
      />
    </RailWindow>
  );
}
