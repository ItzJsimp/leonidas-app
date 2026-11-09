// @effect-diagnostics nodeBuiltinImport:off - Plain file boundary for pinned model assets.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import { IMAGE_MODEL_ASSETS, modelDownloadBytes } from "@t3tools/shared/imageAssets";

import { downloadImageAsset, verifyImageAsset } from "./imageDownload.ts";

/** Reuse verified files in place. Every other file goes into the managed model folder. */
export async function installImageModel(input: {
  readonly modelId: string;
  readonly folder: string;
  readonly existingFolders: readonly string[];
  readonly signal?: AbortSignal;
  readonly onProgress?: (received: number, total: number) => void;
}) {
  const assets = IMAGE_MODEL_ASSETS[input.modelId];
  if (!assets) throw new Error("This model has no verified download yet.");
  if (
    !NodePath.isAbsolute(input.folder) ||
    input.existingFolders.some((folder) => !NodePath.isAbsolute(folder))
  ) {
    throw new Error("Choose absolute model folder paths.");
  }
  let completed = 0;
  const total = modelDownloadBytes(input.modelId);
  const reusedFolders = new Set<string>();
  const plan: Array<{ asset: (typeof assets)[number]; reused: boolean }> = [];
  for (const asset of assets) {
    input.signal?.throwIfAborted();
    let reused = false;
    for (const folder of input.existingFolders) {
      if (
        await verifyImageAsset(
          NodePath.join(folder, asset.path),
          asset.size,
          asset.sha256,
          input.signal,
        )
      ) {
        reusedFolders.add(folder);
        reused = true;
        break;
      }
    }
    if (!reused) {
      reused = await verifyImageAsset(
        NodePath.join(input.folder, asset.path),
        asset.size,
        asset.sha256,
        input.signal,
      );
    }
    plan.push({ asset, reused });
  }
  await NodeFSP.mkdir(input.folder, { recursive: true });
  let needed = 0;
  for (const { asset, reused } of plan) {
    if (reused) continue;
    let partialSize = 0;
    try {
      const partial = await NodeFSP.lstat(`${NodePath.join(input.folder, asset.path)}.part`);
      if (partial.isFile() && partial.size <= asset.size) partialSize = partial.size;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    needed += asset.size - partialSize;
  }
  const disk = await NodeFSP.statfs(input.folder);
  if (disk.bavail * disk.bsize < needed) {
    throw new Error("There is not enough free space for this model. Choose another drive.");
  }
  for (const { asset, reused } of plan) {
    if (!reused) {
      await downloadImageAsset(
        {
          url: `${asset.origin}/${asset.path}`,
          file: NodePath.join(input.folder, asset.path),
          size: asset.size,
          sha256: asset.sha256,
        },
        {
          signal: input.signal,
          onProgress: (received) => input.onProgress?.(completed + received, total),
        },
      );
    }
    completed += asset.size;
    input.onProgress?.(completed, total);
  }
  return [...reusedFolders];
}

/** JSON is valid YAML. ComfyUI accepts these extra search paths without changing user files. */
export async function writeImageModelPaths(file: string, folders: readonly string[]) {
  const paths = Object.fromEntries(
    folders.map((folder, index) => [
      `leonidas_${index}`,
      {
        base_path: folder,
        diffusion_models: "diffusion_models",
        text_encoders: "text_encoders",
        vae: "vae",
      },
    ]),
  );
  await NodeFSP.mkdir(NodePath.dirname(file), { recursive: true });
  await NodeFSP.writeFile(file, JSON.stringify(paths));
}
