import {
  DownloadIcon,
  ImageIcon,
  StarIcon,
  PaintbrushIcon,
  PenLineIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "../ui/button";
import {
  AlertDialog,
  AlertDialogPopup,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogClose,
} from "../ui/alert-dialog";
import { Textarea } from "../ui/textarea";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { exportImage, type ImageExportFormat } from "./imageExport";
import { toastManager } from "../ui/toast";
import { MakePanel } from "./MakePanel";
import { ImagesSetup } from "./ImagesSetup";
import { ProgressBar } from "../commandCenter/charts";
import type { CreateMemory } from "./useCreateMemory";
import type { ImagesApi, GenerateRequest } from "./useImagesCatalog";
import { ImageMaskCanvas } from "./ImageMaskCanvas";
import { randomSeed } from "./catalog.logic";

/** Keep generation controls, the selected picture, and recent versions visible together. */
export function WorkbenchView({
  api,
  memory,
  onChange,
}: {
  readonly api: ImagesApi;
  readonly memory: CreateMemory;
  readonly onChange: (patch: Partial<CreateMemory>) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [masking, setMasking] = useState(false);
  const [mask, setMask] = useState<{ readonly itemId: string; readonly png: string } | null>(null);
  const [maskBusy, setMaskBusy] = useState(false);
  const [editMode, setEditMode] = useState<"edit" | "variation">("edit");
  const editRef = useRef<HTMLTextAreaElement>(null);
  const [exporting, setExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<ImageExportFormat>("png");
  const [editPrompt, setEditPrompt] = useState("");
  const [backgroundSetup, setBackgroundSetup] = useState(false);
  const [importing, setImporting] = useState(false);
  const importController = useRef<AbortController | null>(null);
  useEffect(() => () => importController.current?.abort(), []);
  const backgroundReady = api.setupState?.installedModelIds?.includes("birefnet") ?? false;
  const versions = useMemo(
    () => api.items.filter((item) => item.status === "done").slice(0, 20),
    [api.items],
  );
  const selected =
    versions.find((item) => item.jobId === pendingJobId) ??
    versions.find((item) => item.id === selectedId) ??
    versions[0];
  const selectedUrl = selected ? api.imageUrl(selected) : null;
  const generationWidth = Math.min(
    2048,
    Math.max(256, Math.round((selected?.width ?? 1024) / 64) * 64),
  );
  const generationHeight = Math.min(
    2048,
    Math.max(256, Math.round((selected?.height ?? 1024) / 64) * 64),
  );
  const running = api.items.find((item) => item.status === "running");
  const failed = api.items
    .slice(0, 5)
    .filter((item) => item.status === "error" || item.status === "cancelled")
    .slice(0, 2);
  const selectImage = (itemId: string) => {
    setSelectedId(itemId);
    setPendingJobId(null);
    setMask(null);
    setMasking(false);
    setMaskBusy(false);
  };
  const generate = async (request: GenerateRequest) => {
    const result = await api.generate(request);
    if (
      result &&
      typeof result === "object" &&
      "jobId" in result &&
      typeof result.jobId === "string"
    ) {
      setPendingJobId(result.jobId);
      setMask(null);
      setMasking(false);
      setMaskBusy(false);
    }
    return result;
  };
  const exportSelected = async () => {
    if (!selectedUrl) return;
    setExporting(true);
    try {
      await exportImage(selectedUrl, exportFormat);
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not export the picture",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setExporting(false);
    }
  };
  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-[18.75rem_minmax(0,1fr)_8.25rem] lg:grid-cols-[18.75rem_minmax(0,1fr)]">
      <aside aria-label="Make an image" className="min-w-0">
        <MakePanel api={{ ...api, generate }} memory={memory} onChange={onChange} />
      </aside>
      <section aria-label="Selected image" className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {api.importReference ? (
            <label className="inline-flex min-h-8 cursor-pointer items-center rounded-md border px-2.5 text-xs font-medium focus-within:ring-2 focus-within:ring-inset focus-within:ring-ring">
              {importing ? "Importing" : "Import PNG"}
              <input
                type="file"
                accept="image/png"
                className="sr-only"
                aria-label="Import a PNG reference"
                disabled={importing}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file || importing) return;
                  const controller = new AbortController();
                  importController.current = controller;
                  setImporting(true);
                  void api
                    .importReference?.(file, controller.signal)
                    .then((itemId) => {
                      if (itemId && !controller.signal.aborted) selectImage(itemId);
                    })
                    .finally(() => {
                      if (importController.current === controller) importController.current = null;
                      if (!controller.signal.aborted) setImporting(false);
                    });
                }}
              />
            </label>
          ) : null}
          <Button
            variant={!masking ? "secondary" : "outline"}
            size="sm"
            disabled={!selected}
            onClick={() => {
              setMasking(false);
              setMask(null);
              setMaskBusy(false);
              editRef.current?.focus();
            }}
          >
            <PenLineIcon />
            Edit with words
          </Button>
          <Button
            variant={masking ? "secondary" : "outline"}
            size="sm"
            aria-pressed={masking}
            disabled={!selected || selected.width > 2048 || selected.height > 2048}
            onClick={() => {
              setMasking(!masking);
              setMask(null);
              setMaskBusy(false);
              setEditMode("edit");
            }}
          >
            <PaintbrushIcon />
            Brush
          </Button>
          <Select
            value={exportFormat}
            onValueChange={(value) => value && setExportFormat(value)}
            disabled={!selectedUrl || exporting}
          >
            <SelectTrigger aria-label="Export format" className="w-36" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value="png">PNG image</SelectItem>
              <SelectItem value="ico">Windows icon</SelectItem>
              <SelectItem value="icns">Mac icon</SelectItem>
              <SelectItem value="icon-set">PNG icon set</SelectItem>
            </SelectPopup>
          </Select>
          <Button
            variant="outline"
            size="sm"
            disabled={!selected || !api.setupState?.folder || !api.setup}
            onClick={() => {
              if (!backgroundReady) {
                setBackgroundSetup(true);
                return;
              }
              if (!selected) return;
              void generate({
                prompt: "Remove the background",
                referenceItemId: selected.id,
                modelIds: ["birefnet"],
                width: generationWidth,
                height: generationHeight,
                seed: selected.seed,
                count: 1,
                steps: null,
                guidance: null,
                sampler: null,
                negativePrompt: "",
              });
            }}
          >
            Remove background
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!selected || selected.width > 2048 || selected.height > 2048}
            onClick={() => {
              if (!selected) return;
              void generate({
                prompt: "Enlarge the image 2x",
                referenceItemId: selected.id,
                modelIds: ["upscale"],
                width: generationWidth,
                height: generationHeight,
                seed: selected.seed,
                count: 1,
                steps: null,
                guidance: null,
                sampler: null,
                negativePrompt: "",
              });
            }}
          >
            Upscale 2x
          </Button>
          <AlertDialog open={backgroundSetup} onOpenChange={setBackgroundSetup}>
            <AlertDialogPopup>
              <AlertDialogHeader>
                <AlertDialogTitle>Set up background removal</AlertDialogTitle>
                <AlertDialogDescription>
                  Download 424 MB for local background removal. The tool works offline after setup.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
                <AlertDialogClose
                  render={
                    <Button
                      disabled={api.items.some(
                        (item) => item.status === "running" || item.status === "waiting",
                      )}
                      onClick={() => {
                        if (api.setupState?.folder)
                          void api.setup?.({ folder: api.setupState.folder, modelId: "birefnet" });
                      }}
                    />
                  }
                >
                  Download
                </AlertDialogClose>
              </AlertDialogFooter>
            </AlertDialogPopup>
          </AlertDialog>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="View previous version"
            disabled={
              !selected || !versions[versions.findIndex((item) => item.id === selected.id) + 1]
            }
            onClick={() => {
              const previous = versions[versions.findIndex((item) => item.id === selected?.id) + 1];
              if (previous) selectImage(previous.id);
            }}
          >
            <RotateCcwIcon />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!selected}
            onClick={() => selected && void api.keep(selected, !selected.kept)}
          >
            <StarIcon />
            {selected?.kept ? "Kept" : "Keep"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!selectedUrl || exporting}
            onClick={() => void exportSelected()}
          >
            <DownloadIcon />
            {exporting ? "Exporting" : "Export"}
          </Button>
        </div>
        <div className="flex min-h-80 flex-1 items-center justify-center overflow-hidden rounded-xl bg-muted p-3">
          {api.setup && api.setupState && !api.setupState.installedModelIds?.length ? (
            <ImagesSetup api={api} />
          ) : selectedUrl && selected ? (
            <ImageMaskCanvas
              key={`${selected.id}:${masking}`}
              url={selectedUrl}
              width={selected.width}
              height={selected.height}
              enabled={masking}
              alt={selected.prompt}
              onMask={(png) => setMask(png ? { itemId: selected.id, png } : null)}
              onBusy={setMaskBusy}
              onError={(error) =>
                toastManager.add({
                  type: "error",
                  title: "Could not prepare the brush mask",
                  description: error instanceof Error ? error.message : String(error),
                })
              }
            />
          ) : (
            <div className="flex flex-col items-center gap-3 p-6 text-center text-muted-foreground">
              <ImageIcon className="size-8" />
              <p className="text-sm">
                {running ? "Your image is being generated." : "Describe an image to start."}
              </p>
            </div>
          )}
        </div>
        {selected ? (
          <form
            className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!editPrompt.trim() || maskBusy || (masking && mask?.itemId !== selected.id))
                return;
              void generate({
                prompt: editPrompt.trim(),
                referenceItemId: selected.id,
                modelIds: ["flux2klein"],
                width: generationWidth,
                height: generationHeight,
                seed: editMode === "variation" ? randomSeed() : selected.seed,
                ...(masking && mask?.itemId === selected.id ? { maskPng: mask.png } : {}),
                count: 1,
                steps: null,
                guidance: null,
                sampler: null,
                negativePrompt: "",
              });
            }}
          >
            <Textarea
              ref={editRef}
              aria-label="Image edit instructions"
              placeholder="Describe a change"
              value={editPrompt}
              maxLength={4000}
              onChange={(event) => setEditPrompt(event.target.value)}
              className="min-h-10 min-w-0 flex-1 basis-full lg:basis-48"
            />
            <div
              role="group"
              aria-label="Edit mode"
              className="flex shrink-0 overflow-hidden rounded-md border"
            >
              <Button
                type="button"
                size="sm"
                variant={editMode === "edit" ? "secondary" : "ghost"}
                aria-pressed={editMode === "edit"}
                onClick={() => setEditMode("edit")}
              >
                Edit this image
              </Button>
              <Button
                type="button"
                size="sm"
                variant={editMode === "variation" ? "secondary" : "ghost"}
                aria-pressed={editMode === "variation"}
                onClick={() => {
                  setEditMode("variation");
                  setMasking(false);
                  setMask(null);
                  setMaskBusy(false);
                }}
              >
                New variation
              </Button>
            </div>
            <Button
              type="submit"
              disabled={
                !editPrompt.trim() ||
                maskBusy ||
                (masking && mask?.itemId !== selected.id) ||
                !api.catalog.some((model) => model.id === "flux2klein" && model.state === "ready")
              }
            >
              Apply
            </Button>
          </form>
        ) : null}
      </section>
      <aside
        aria-label="Image versions"
        className="flex min-w-0 flex-col gap-3 lg:col-start-2 xl:col-start-3 xl:row-start-1"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold">Versions</h2>
        </div>
        {running ? (
          <div role="status" className="flex flex-col gap-2 rounded-lg border p-2 text-xs">
            <span>Generating</span>
            {running.totalSteps ? (
              <>
                <ProgressBar
                  percent={Math.round(((running.completedSteps ?? 0) / running.totalSteps) * 100)}
                  label="Image generation"
                />
                <span>
                  Step {running.completedSteps ?? 0} of {running.totalSteps}
                </span>
              </>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={() => void api.cancel(true, running.jobId)}
            >
              Cancel
            </Button>
          </div>
        ) : null}
        {failed.map((item) => (
          <div
            key={item.id}
            role={item.status === "error" ? "alert" : "status"}
            className="flex flex-col gap-2 rounded-lg border p-2 text-xs"
          >
            <span className="wrap-anywhere">{item.error ?? "Stopped"}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPendingJobId(item.jobId);
                void api.retry(item);
              }}
            >
              Retry
            </Button>
          </div>
        ))}
        <div className="grid grid-cols-4 gap-2 xl:grid-cols-1">
          {versions.map((item) => {
            const url = api.imageUrl(item);
            return (
              <button
                key={item.id}
                type="button"
                aria-label={`View ${item.modelLabel}, seed ${item.seed}`}
                aria-pressed={selected?.id === item.id}
                onClick={() => selectImage(item.id)}
                className="overflow-hidden rounded-lg border p-1 text-start outline-hidden aria-pressed:ring-2 aria-pressed:ring-inset aria-pressed:ring-ring focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                {url ? (
                  <img
                    src={url}
                    alt={item.prompt}
                    loading="lazy"
                    className="aspect-square w-full rounded-sm object-cover"
                  />
                ) : null}
                <span className="block truncate px-1 pt-1 text-2xs text-muted-foreground">
                  {item.modelLabel}
                </span>
              </button>
            );
          })}
        </div>
        {!versions.length ? (
          <p className="text-xs text-muted-foreground">Your images appear here.</p>
        ) : null}
        <Button variant="ghost" size="sm" onClick={() => onChange({ view: "gallery" })}>
          Open Library
        </Button>
      </aside>
    </div>
  );
}
