// @effect-diagnostics nodeBuiltinImport:off globalTimers:off globalDate:off - Test drives plain async code against a temp folder.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  imageBaseName,
  parseRecipe,
  readStoredImages,
  saveImageWithRecipe,
  setKept,
  timestampName,
} from "./recipe.ts";

let root: string;
beforeEach(async () => {
  root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "images-recipe-"));
});
afterEach(async () => {
  await NodeFSP.rm(root, { recursive: true, force: true });
});

const recipe = {
  source: "comfyui",
  prompt: "cute mint-green ghost slime",
  seed: 7,
  modelId: "flux2klein",
  modelLabel: "FLUX.2 klein 4B",
  settings: { steps: 4, cfg: 1 },
  createdAt: "2026-10-15T14:30:12.000Z",
  seconds: 12.3,
};

describe("file names", () => {
  it("names a file from the time, model and seed", () => {
    const date = new Date("2026-10-15T14:30:12.345Z");
    expect(timestampName(date)).toBe("20261015-143012");
    expect(imageBaseName(date, "flux2klein", 7)).toBe("20261015-143012_flux2klein_7");
  });

  it("removes unsafe characters from the model id", () => {
    expect(imageBaseName(new Date(0), "a/b:c", 1)).toBe("19700101-000000_a-b-c_1");
  });
});

describe("saveImageWithRecipe", () => {
  it("preserves a Recipe whose image file is missing", async () => {
    const dir = NodePath.join(root, "images");
    await NodeFSP.mkdir(dir);
    await NodeFSP.writeFile(NodePath.join(dir, "a.json"), "original");
    const saved = await saveImageWithRecipe({ dir, base: "a", bytes: new Uint8Array([1]), recipe });
    expect(saved.name).toBe("a-2");
    expect(await NodeFSP.readFile(NodePath.join(dir, "a.json"), "utf8")).toBe("original");
  });
  it("writes the PNG and a Recipe sidecar with the same base name", async () => {
    const dir = NodePath.join(root, "images");
    const saved = await saveImageWithRecipe({
      dir,
      bytes: new Uint8Array([1, 2, 3]),
      base: "a_1",
      recipe,
    });
    expect(saved.name).toBe("a_1");
    expect([...(await NodeFSP.readFile(saved.pngPath))]).toEqual([1, 2, 3]);
    const written = JSON.parse(await NodeFSP.readFile(saved.recipePath, "utf8"));
    expect(written).toEqual({ version: 1, ...recipe, file: "a_1.png" });
  });

  it("never overwrites an image with the same name", async () => {
    const dir = NodePath.join(root, "images");
    const first = await saveImageWithRecipe({ dir, bytes: new Uint8Array([1]), base: "a", recipe });
    const second = await saveImageWithRecipe({
      dir,
      bytes: new Uint8Array([2]),
      base: "a",
      recipe,
    });
    expect(first.name).toBe("a");
    expect(second.name).toBe("a-2");
    expect([...(await NodeFSP.readFile(first.pngPath))]).toEqual([1]);
  });
});

describe("parseRecipe", () => {
  it("reads a saved Recipe", () => {
    const text = JSON.stringify({ version: 1, ...recipe, file: "x.png" });
    expect(parseRecipe(text)).toMatchObject({ prompt: recipe.prompt, seed: 7, file: "x.png" });
  });

  it("skips broken or foreign JSON", () => {
    expect(parseRecipe("{not json")).toBeNull();
    expect(parseRecipe(JSON.stringify({ version: 2 }))).toBeNull();
    expect(parseRecipe("null")).toBeNull();
  });

  it("keeps only the file name, never a folder", () => {
    const text = JSON.stringify({ version: 1, ...recipe, file: "../../evil.png" });
    expect(parseRecipe(text)?.file).toBe("evil.png");
  });
});

describe("keep and read back", () => {
  it("copies into kept/ and removes the copies again", async () => {
    const dir = NodePath.join(root, "images");
    const saved = await saveImageWithRecipe({ dir, bytes: new Uint8Array([9]), base: "k", recipe });
    await setKept(dir, saved.name, true);
    expect([...(await NodeFSP.readFile(NodePath.join(dir, "kept", "k.png")))]).toEqual([9]);
    expect((await readStoredImages(dir, 10))[0]?.kept).toBe(true);
    await setKept(dir, saved.name, false);
    expect((await readStoredImages(dir, 10))[0]?.kept).toBe(false);
    // The original stays.
    expect((await NodeFSP.stat(saved.pngPath)).size).toBe(1);
  });

  it("lists the newest images first, up to the limit, and skips sidecars without a PNG", async () => {
    const dir = NodePath.join(root, "images");
    for (const base of ["20260101-000000_a_1", "20260102-000000_a_2", "20260103-000000_a_3"]) {
      await saveImageWithRecipe({ dir, bytes: new Uint8Array([1]), base, recipe });
    }
    await NodeFSP.rm(NodePath.join(dir, "20260103-000000_a_3.png"));
    const stored = await readStoredImages(dir, 2);
    expect(stored.map((s) => s.name)).toEqual(["20260102-000000_a_2", "20260101-000000_a_1"]);
  });

  it("returns an empty list when the folder does not exist", async () => {
    expect(await readStoredImages(NodePath.join(root, "none"), 10)).toEqual([]);
  });
});
