import { modelDownloadBytes } from "@t3tools/shared/imageAssets";
import { useId, useState } from "react";
import { CpuIcon, DownloadIcon, FolderIcon, HardDriveIcon } from "lucide-react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { ProgressBar } from "../commandCenter/charts";
import type { ImagesApi } from "./useImagesCatalog";

const GB = 1024 ** 3;
const formatSize = (bytes: number) => `${(bytes / GB).toFixed(1)} GB`;

/** The approved setup card, with real capacity and an explicit download action. */
export function ImagesSetup({ api }: { readonly api: ImagesApi }) {
  const folderId = useId();
  const existingId = useId();
  const [folder, setFolder] = useState<string | null>(null);
  const [existing, setExisting] = useState("");
  const [modelId, setModelId] = useState<"flux2klein" | "zimage" | "qwen" | "hidream">(
    "flux2klein",
  );
  const [starting, setStarting] = useState(false);
  const setup = api.setupState;
  if (!setup || !api.setup) return null;
  const busy = starting || setup.phase === "downloading" || setup.phase === "extracting";
  const total = busy
    ? setup.total
    : (setup.engineBytes ?? setup.total) + modelDownloadBytes(modelId);
  const targetFolder = (folder ?? setup.folder).replaceAll("\\", "/").toLowerCase();
  const volume = api.storageVolumes
    ?.filter((entry) => {
      const mount = entry.mount.replaceAll("\\", "/").toLowerCase().replace(/\/$/, "");
      return targetFolder === mount || targetFolder.startsWith(`${mount}/`);
    })
    .toSorted((a, b) => b.mount.length - a.mount.length)[0];
  const percent =
    setup.total > 0 ? Math.min(100, Math.round((setup.received / setup.total) * 100)) : 0;
  const start = async () => {
    setStarting(true);
    try {
      await api.setup?.({
        folder: folder ?? setup.folder,
        modelId,
        existingFolders: existing.trim() ? [existing.trim()] : [],
      });
    } finally {
      setStarting(false);
    }
  };
  return (
    <section
      aria-labelledby="images-setup-heading"
      className="mx-auto flex w-full max-w-xl flex-col gap-4 rounded-xl border bg-card p-5"
    >
      <h2 id="images-setup-heading" className="text-lg font-semibold">
        Make pictures on this computer
      </h2>
      <dl className="divide-y rounded-lg border text-sm">
        <div className="flex items-center gap-3 p-3">
          <CpuIcon className="size-4 shrink-0" />
          <dt>Graphics card</dt>
          <dd className="ms-auto text-right">{api.hardware.gpuName}</dd>
        </div>
        <div className="flex items-center gap-3 p-3">
          <HardDriveIcon className="size-4 shrink-0" />
          <dt>Memory</dt>
          <dd className="ms-auto tabular-nums">{formatSize(api.hardware.ramBytes)}</dd>
        </div>
        <div className="flex items-center gap-3 p-3">
          <FolderIcon className="size-4 shrink-0" />
          <dt>Free disk space</dt>
          <dd className="ms-auto tabular-nums">
            {volume ? formatSize(volume.freeBytes) : "Checked before download"}
          </dd>
        </div>
      </dl>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={folderId} className="text-sm font-medium">
          Installation folder on this computer
        </label>
        <Input
          id={folderId}
          value={folder ?? setup.folder}
          disabled={busy}
          onChange={(event) => setFolder(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={existingId} className="text-sm font-medium">
          Existing ComfyUI models folder (optional)
        </label>
        <Input
          id={existingId}
          value={existing}
          disabled={busy}
          onChange={(event) => setExisting(event.target.value)}
        />
      </div>
      <Select
        value={modelId}
        onValueChange={(value) => {
          if (
            value === "flux2klein" ||
            value === "zimage" ||
            value === "qwen" ||
            value === "hidream"
          )
            setModelId(value);
        }}
        disabled={busy}
      >
        <SelectTrigger aria-label="First image model">
          <SelectValue />
        </SelectTrigger>
        <SelectPopup>
          <SelectItem value="flux2klein">FLUX.2 klein 4B</SelectItem>
          <SelectItem value="zimage">Z-Image Turbo</SelectItem>
          <SelectItem value="qwen">Qwen-Image 2512</SelectItem>
          <SelectItem value="hidream">HiDream O1 Dev</SelectItem>
        </SelectPopup>
      </Select>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>Image engine and model</span>
        <span className="tabular-nums">Up to {formatSize(total)}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Setup checks existing files before it downloads. Models stay in the folder you choose.
      </p>
      {busy ? (
        <div className="flex flex-col gap-2" role="status">
          <ProgressBar percent={percent} label="Images setup download" />
          <span className="text-sm tabular-nums">
            {setup.phase === "extracting"
              ? "Installing the image engine"
              : `${formatSize(setup.received)} of ${formatSize(setup.total)}`}
          </span>
        </div>
      ) : null}
      {setup.error ? (
        <p role="alert" className="text-sm text-error-foreground">
          {setup.error}
        </p>
      ) : null}
      <div className="flex justify-end">
        {busy ? (
          <Button variant="outline" onClick={() => void api.cancel(true)}>
            Cancel setup
          </Button>
        ) : (
          <Button
            disabled={!api.hardware.ramBytes || !(folder ?? setup.folder).trim()}
            onClick={() => void start()}
          >
            <DownloadIcon />
            {setup.phase === "error" || setup.phase === "cancelled"
              ? "Retry setup"
              : "Download and set up"}
          </Button>
        )}
      </div>
    </section>
  );
}
