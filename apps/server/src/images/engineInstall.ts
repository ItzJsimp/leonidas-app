// @effect-diagnostics nodeBuiltinImport:off - Plain installation boundary with cancellable native extraction.
import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

import { downloadImageAsset } from "./imageDownload.ts";

const VERSION = "v0.42.1-env1";
const ORIGIN = `https://github.com/Comfy-Org/ComfyUI-Standalone-Environments/releases/download/${VERSION}`;
const WINDOWS_FILES = [
  {
    name: `comfyui-standalone-win-nvidia-${VERSION}.7z.001`,
    size: 1992294400,
    sha256: "ac1df968e20da3c866ebbd32f139b43b4c50b850db4d793f50dcd29c2ad84000",
  },
  {
    name: `comfyui-standalone-win-nvidia-${VERSION}.7z.002`,
    size: 457667294,
    sha256: "2186157be0a587223773a53f128d8ce38588e055293ecffd60bb672b8a25ebf5",
  },
] as const;
const MAC_FILE = {
  name: `comfyui-standalone-mac-mps-${VERSION}.tar.gz`,
  size: 810109512,
  sha256: "38c6647f558d739083d4a400ab261b7fbaf548b869f9820acb026b0899cb7ecb",
};

const EXTRACTOR = {
  url: "https://github.com/ip7z/7zip/releases/download/26.06/7zr.exe",
  size: 600064,
  sha256: "e80db2dad715a6c5adabe292d31ed54e11f4e9b99ca349827b50573b175891bc",
};

/** Bytes are pinned to upstream release digests. Extraction needs additional free space. */
export const engineDownloadBytes = (platform: "win32" | "darwin") =>
  platform === "win32"
    ? WINDOWS_FILES.reduce((sum, file) => sum + file.size, EXTRACTOR.size)
    : MAC_FILE.size;

async function run(file: string, args: readonly string[], signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    NodeChildProcess.execFile(
      file,
      [...args],
      {
        signal,
        windowsHide: true,
        timeout: 30 * 60_000,
        maxBuffer: 128 * 1024,
      },
      (error) => (error ? reject(error) : resolve()),
    );
  });
}

/** Install into a private, versioned folder. Failed installs remain available for resume. */
export async function installImageEngine(
  input: {
    readonly folder: string;
    readonly platform: NodeJS.Platform;
    readonly arch: string;
    readonly signal?: AbortSignal;
    readonly onProgress?: (received: number, total: number) => void;
  },
  deps: {
    readonly download?: typeof downloadImageAsset;
    readonly run?: typeof run;
  } = {},
) {
  const { platform, arch } = input;
  if (!((platform === "win32" && arch === "x64") || (platform === "darwin" && arch === "arm64"))) {
    throw new Error("Image setup supports Windows NVIDIA and Apple Silicon Mac only.");
  }
  if (!NodePath.isAbsolute(input.folder))
    throw new Error("Choose an absolute installation folder.");
  input.signal?.throwIfAborted();
  const root = NodePath.join(input.folder, "LeonidasImages");
  const engine = NodePath.join(root, "engine", VERSION);
  const python = NodePath.join(
    engine,
    "standalone-env",
    platform === "win32" ? "python.exe" : "bin/python3",
  );
  const main = NodePath.join(engine, "ComfyUI", "main.py");
  const marker = NodePath.join(engine, "leonidas-install.json");
  const launch = {
    command: python,
    folder: NodePath.dirname(main),
    args: [
      main,
      "--listen",
      "127.0.0.1",
      "--disable-all-custom-nodes",
      "--disable-api-nodes",
      // Measured on Windows: this keeps total VRAM below the release limit.
      ...(platform === "win32" ? ["--disable-dynamic-vram", "--reserve-vram", "2"] : []),
      "--base-directory",
      NodePath.join(root, "data"),
    ],
  };
  try {
    await NodeFSP.access(marker);
    await NodeFSP.access(python);
    await NodeFSP.access(main);
    return launch;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await NodeFSP.mkdir(root, { recursive: true });
  const disk = await NodeFSP.statfs(root);
  if (disk.bavail * disk.bsize < 12 * 1024 ** 3) {
    throw new Error(
      "Image setup needs 12 GB of free disk space before models. Choose another drive.",
    );
  }
  const downloads = NodePath.join(root, "downloads", VERSION);
  await NodeFSP.mkdir(downloads, { recursive: true });
  await NodeFSP.mkdir(engine, { recursive: true });
  const download = deps.download ?? downloadImageAsset;
  const execute = deps.run ?? run;
  let completed = 0;
  const total = engineDownloadBytes(platform);
  const fetchFile = async (file: { name: string; size: number; sha256: string; url?: string }) => {
    const target = NodePath.join(downloads, file.name);
    await download(
      { ...file, url: file.url ?? `${ORIGIN}/${file.name}`, file: target },
      {
        signal: input.signal,
        onProgress: (received) => input.onProgress?.(completed + received, total),
      },
    );
    completed += file.size;
    return target;
  };
  if (platform === "win32") {
    const extractor = await fetchFile({ ...EXTRACTOR, name: "7zr.exe" });
    for (const file of WINDOWS_FILES) await fetchFile(file);
    await execute(
      extractor,
      ["x", NodePath.join(downloads, WINDOWS_FILES[0].name), `-o${engine}`, "-y", "-bso0", "-bsp0"],
      input.signal,
    );
  } else {
    const archive = await fetchFile(MAC_FILE);
    await execute("/usr/bin/tar", ["-xzf", archive, "-C", engine], input.signal);
  }
  input.signal?.throwIfAborted();
  await NodeFSP.access(python);
  await NodeFSP.access(main);
  await NodeFSP.mkdir(NodePath.join(root, "data"), { recursive: true });
  await NodeFSP.writeFile(marker, JSON.stringify({ version: VERSION }));
  return launch;
}
