// @effect-diagnostics nodeBuiltinImport:off - Temporary files verify the model installation boundary.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { installImageModel, writeImageModelPaths } from "./modelInstall.ts";

const homes: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    homes.splice(0).map((home) => NodeFSP.rm(home, { recursive: true, force: true })),
  );
});
async function fixture() {
  const folder = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "images model "));
  homes.push(folder);
  return folder;
}

describe("model installation", () => {
  it("reports a refused model download without creating a ready model", async () => {
    const folder = await fixture();
    const fetchFake = vi.fn(async () => new Response("Forbidden", { status: 403 }));
    vi.stubGlobal("fetch", fetchFake);
    await expect(
      installImageModel({ modelId: "flux2klein", folder, existingFolders: [] }),
    ).rejects.toThrow(/403/);
    expect(fetchFake).toHaveBeenCalledTimes(1);
    await expect(
      NodeFSP.access(NodePath.join(folder, "diffusion_models", "flux-2-klein-4b.safetensors")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects unsupported models without making a request", async () => {
    const fetchFake = vi.fn();
    vi.stubGlobal("fetch", fetchFake);
    await expect(
      installImageModel({ modelId: "unknown", folder: await fixture(), existingFolders: [] }),
    ).rejects.toThrow(/no verified download/);
    expect(fetchFake).not.toHaveBeenCalled();
  });

  it("writes model search paths as values, including spaces and YAML punctuation", async () => {
    const file = NodePath.join(await fixture(), "model-paths.yaml");
    await writeImageModelPaths(file, ["F:/Model files/#my:models"]);
    expect(JSON.parse(await NodeFSP.readFile(file, "utf8"))).toEqual({
      leonidas_0: {
        base_path: "F:/Model files/#my:models",
        diffusion_models: "diffusion_models",
        text_encoders: "text_encoders",
        vae: "vae",
      },
    });
  });
});
