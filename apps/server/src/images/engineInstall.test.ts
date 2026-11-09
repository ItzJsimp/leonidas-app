// @effect-diagnostics nodeBuiltinImport:off - Real temporary files verify installation completion.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { engineDownloadBytes, installImageEngine } from "./engineInstall.ts";

const homes: string[] = [];
afterEach(async () => {
  await Promise.all(
    homes.splice(0).map((home) => NodeFSP.rm(home, { recursive: true, force: true })),
  );
});
async function home() {
  const folder = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "image setup "));
  homes.push(folder);
  return folder;
}

describe("installImageEngine", () => {
  it("rejects unsupported systems before any download", async () => {
    await expect(
      installImageEngine({ folder: await home(), platform: "linux", arch: "x64" }),
    ).rejects.toThrow(/supports Windows NVIDIA and Apple Silicon/);
  });

  it("verifies every archive before extraction and reuses a complete install", async () => {
    const folder = await home();
    const downloaded: string[] = [];
    const progress: number[] = [];
    const deps = {
      download: async (
        asset: { url: string; sha256: string; size: number },
        options?: {
          onProgress?: (received: number) => void;
        },
      ) => {
        expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/);
        downloaded.push(asset.url);
        options?.onProgress?.(asset.size);
      },
      run: async (_file: string, args: readonly string[]) => {
        expect(downloaded).toHaveLength(3);
        const engine = args.find((arg) => arg.startsWith("-o"))!.slice(2);
        await NodeFSP.mkdir(NodePath.join(engine, "standalone-env"), { recursive: true });
        await NodeFSP.mkdir(NodePath.join(engine, "ComfyUI"), { recursive: true });
        await NodeFSP.writeFile(NodePath.join(engine, "standalone-env", "python.exe"), "python");
        await NodeFSP.writeFile(NodePath.join(engine, "ComfyUI", "main.py"), "main");
      },
    };
    const input = {
      folder,
      platform: "win32" as const,
      arch: "x64",
      onProgress: (received: number) => progress.push(received),
    };
    const first = await installImageEngine(input, deps);
    expect(first.args).toContain("--disable-all-custom-nodes");
    expect(first.args).toContain("127.0.0.1");
    expect(first.command).toContain("python.exe");
    expect(progress.at(-1)).toBe(engineDownloadBytes("win32"));
    const second = await installImageEngine(input, {
      download: async () => {
        throw new Error("Offline");
      },
      run: async () => {
        throw new Error("Must not extract twice");
      },
    });
    expect(second).toEqual(first);
  });

  it("does not mark an incomplete extraction as installed", async () => {
    const folder = await home();
    await expect(
      installImageEngine(
        { folder, platform: "win32", arch: "x64" },
        {
          download: async () => {},
          run: async () => {},
        },
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      NodeFSP.access(
        NodePath.join(folder, "LeonidasImages", "engine", "v0.42.1-env1", "leonidas-install.json"),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
