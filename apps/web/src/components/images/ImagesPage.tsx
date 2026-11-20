import { FlaskConicalIcon } from "lucide-react";
import { useCallback, useMemo } from "react";

import { usePrimaryEnvironmentId } from "~/state/environments";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { SidebarInset } from "../ui/sidebar";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Spinner } from "../ui/spinner";
import { Switch } from "../ui/switch";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { WindowHeader } from "../twoState/WindowHeader";
import { ASPECTS, SIZES, dimensionsFor } from "./catalog.logic";
import { CreateView } from "./CreateView";
import { GalleryView } from "./GalleryView";
import { ImagesQueueBar } from "./ImagesQueueBar";
import { describeQueue, sourcePhase } from "./images.logic";
import type { GalleryItem } from "./images.mock";
import { ModelsView } from "./ModelsView";
import { AddressField, SetupCard } from "./SetupCard";
import { useCreateMemory, type CreateMemory, type ImagesView } from "./useCreateMemory";
import { useImagesCatalog, type ImagesApi, type PreviewSettings } from "./useImagesCatalog";
import { useImagesLive } from "./useImagesLive";

/** Finds the aspect and size presets that give these pixels. Null when no preset matches. */
function presetsFor(width: number, height: number): Pick<CreateMemory, "aspect" | "size"> | null {
  for (const aspect of ASPECTS) {
    for (const size of SIZES) {
      const dims = dimensionsFor(aspect.id, size.id);
      if (dims.width === width && dims.height === height)
        return { aspect: aspect.id, size: size.id };
    }
  }
  return null;
}

/** Dev-only switches for the sample data: card size, ComfyUI state, catalog size, empty gallery. */
function PreviewMenu(props: {
  readonly preview: PreviewSettings;
  readonly onChange: (patch: Partial<PreviewSettings>) => void;
}) {
  const { preview, onChange } = props;
  const row = (
    label: string,
    checked: boolean,
    key: "sample" | "online" | "bigCatalog" | "emptyGallery",
  ) => (
    <label className="flex min-h-9 items-center justify-between gap-4 text-sm">
      {label}
      <Switch checked={checked} onCheckedChange={(value) => onChange({ [key]: value })} />
    </label>
  );
  return (
    <Popover>
      <PopoverTrigger render={<Button size="sm" variant="ghost" />}>
        <FlaskConicalIcon />
        Test data
      </PopoverTrigger>
      <PopoverPopup className="w-72">
        <PopoverTitle className="mb-2">Test data (dev only)</PopoverTitle>
        <div className="flex flex-col gap-1">
          {row("Use sample data", preview.sample, "sample")}
          {preview.sample ? (
            <>
              <span className="text-sm">Graphics card</span>
              <ToggleGroup
                aria-label="Graphics card"
                className="w-full *:flex-1"
                value={[preview.gpu]}
                onValueChange={(next) => {
                  const gpu = next[0];
                  if (gpu === "6" || gpu === "12" || gpu === "24") onChange({ gpu });
                }}
              >
                <Toggle value="6">6 GB</Toggle>
                <Toggle value="12">12 GB</Toggle>
                <Toggle value="24">24 GB</Toggle>
              </ToggleGroup>
              {row("ComfyUI connected", preview.online, "online")}
              {row("20 models", preview.bigCatalog, "bigCatalog")}
              {row("Empty gallery", preview.emptyGallery, "emptyGallery")}
            </>
          ) : null}
        </div>
      </PopoverPopup>
    </Popover>
  );
}

const BADGE = {
  checking: { variant: "secondary", text: "Checking ComfyUI..." },
  online: { variant: "success", text: "ComfyUI connected" },
  offline: { variant: "warning", text: "ComfyUI not found" },
} as const;

function ConnectionBadge(props: { readonly api: ImagesApi }) {
  const { source } = props.api;
  const phase = sourcePhase(source);
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="rounded-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          />
        }
      >
        <Badge variant={BADGE[phase].variant} size="lg">
          {BADGE[phase].text}
        </Badge>
      </PopoverTrigger>
      <PopoverPopup className="w-80">
        <PopoverTitle className="mb-1">Connection</PopoverTitle>
        <p className="mb-3 text-sm text-muted-foreground">
          {source.online ? `ComfyUI answers at ${source.baseUrl}.` : source.message}
        </p>
        <AddressField baseUrl={source.baseUrl} onSave={props.api.setBaseUrl} />
      </PopoverPopup>
    </Popover>
  );
}

const VIEWS: ReadonlyArray<{ id: ImagesView; label: string }> = [
  { id: "create", label: "Create" },
  { id: "models", label: "Models" },
  { id: "gallery", label: "Gallery" },
];

/** Make pictures with models on this computer, compare models and keep the best results. */
function ImagesPageBody() {
  const sampleApi = useImagesCatalog();
  const liveApi = useImagesLive();
  const sample = sampleApi.preview.sample;
  const api: ImagesApi = sample ? sampleApi : liveApi;
  const [memory, patch] = useCreateMemory();
  const { items, catalog } = api;
  const queue = useMemo(() => describeQueue(items), [items]);
  const latestJob = items[0]?.jobId ?? null;
  const latest = useMemo(
    () => (latestJob ? items.filter((item) => item.jobId === latestJob) : []),
    [items, latestJob],
  );
  const doneCount = useMemo(() => items.filter((item) => item.status === "done").length, [items]);

  const reuse = useCallback(
    (item: GalleryItem) => {
      const runModels = [
        ...new Set(
          items.filter((entry) => entry.jobId === item.jobId).map((entry) => entry.modelId),
        ),
      ];
      patch({
        view: "create",
        prompt: item.prompt,
        modelIds: runModels,
        seedMode: "fixed",
        seed: String(item.seed),
        steps: item.steps,
        guidance: item.guidance,
        sampler: item.sampler,
        negativePrompt: item.negativePrompt,
        ...presetsFor(item.width, item.height),
      });
    },
    [items, patch],
  );
  const lockSeed = useCallback(
    (item: GalleryItem) =>
      patch({ view: "create", seedMode: "fixed", seed: String(item.seed), seedLocked: true }),
    [patch],
  );
  const galleryActions = {
    imageUrl: api.imageUrl,
    onKeep: api.keep,
    onRetry: api.retry,
    onRemove: api.remove ?? undefined,
    onReuse: reuse,
    onLockSeed: lockSeed,
  };

  const tabs = VIEWS.map((view) =>
    view.id === "gallery" && doneCount > 0
      ? { ...view, label: `${view.label} ${doneCount}` }
      : view,
  );

  return (
    <SidebarInset className="h-full min-h-0 overflow-hidden overscroll-y-none isolate">
      <WindowHeader
        title="Images"
        actions={
          <>
            {sample ? (
              <Badge variant="outline" size="lg">
                Sample data
              </Badge>
            ) : null}
            <ConnectionBadge api={api} />
            {import.meta.env.DEV ? (
              <PreviewMenu preview={sampleApi.preview} onChange={sampleApi.patchPreview} />
            ) : null}
          </>
        }
        tabs={tabs}
        active={memory.view}
        onSelect={(view) => patch({ view: view as ImagesView })}
        idBase="images"
      />
      <div
        role="tabpanel"
        id="images-panel"
        aria-labelledby={`images-tab-${memory.view}`}
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto bg-background scrollbar-gutter-both"
      >
        <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">
              Make pictures on your own PC. Give many models the same prompt and compare them.
            </p>
            {api.projects.length > 1 ? (
              <Select
                value={api.projectId ?? ""}
                onValueChange={(value) => value && api.setProjectId(value)}
              >
                <SelectTrigger aria-label="Project" className="w-48">
                  <SelectValue>
                    {api.projects.find((project) => project.id === api.projectId)?.title ??
                      "Choose a project"}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup alignItemWithTrigger={false}>
                  {api.projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.title}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            ) : null}
          </div>

          {api.ready && sourcePhase(api.source) === "offline" ? (
            <SetupCard
              source={api.source}
              checking={api.checking}
              onRecheck={api.recheck}
              onSaveAddress={api.setBaseUrl}
            />
          ) : null}

          <ImagesQueueBar queue={queue} clockSkew={api.clockSkew} onCancel={api.cancel} />

          {memory.view === "create" ? (
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(22rem,28rem)_minmax(0,1fr)]">
              <CreateView
                memory={memory}
                onChange={patch}
                catalog={catalog}
                items={items}
                online={api.source.online}
                checking={sourcePhase(api.source) === "checking"}
                canAdjust={api.canAdjust}
                onGenerate={(request) => void api.generate(request)}
                onOpenModels={() => patch({ view: "models" })}
              />
              <div className="flex min-w-0 flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">Latest run</h2>
                  {items.length > 0 ? (
                    <Button size="sm" variant="ghost" onClick={() => patch({ view: "gallery" })}>
                      Open Gallery
                    </Button>
                  ) : null}
                </div>
                <GalleryView items={latest} compact {...galleryActions} />
              </div>
            </div>
          ) : memory.view === "models" ? (
            <ModelsView
              catalog={catalog}
              hardware={api.hardware}
              items={items}
              selectedIds={memory.modelIds}
              online={api.source.online}
              onSelect={(modelIds) => patch({ modelIds })}
              onInstall={api.install}
              onBenchmark={(ids) => {
                api.runBenchmark(ids);
                patch({ view: "gallery" });
              }}
              onDone={() => patch({ view: "create" })}
            />
          ) : (
            <GalleryView items={items} {...galleryActions} />
          )}
        </div>
      </div>
    </SidebarInset>
  );
}

/** Waits for the environment id first: picture addresses cannot be asked for without it. */
export function ImagesPage() {
  const environmentId = usePrimaryEnvironmentId();
  if (environmentId === null) {
    return (
      <SidebarInset className="h-full min-h-0 items-center justify-center">
        <Spinner />
      </SidebarInset>
    );
  }
  return <ImagesPageBody />;
}
