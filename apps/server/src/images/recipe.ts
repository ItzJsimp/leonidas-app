// @effect-diagnostics nodeBuiltinImport:off preferSchemaOverJson:off - Plain file helpers for the project images folder.
/**
 * Image files and Recipe sidecars.
 *
 * Each image `<name>.png` has a Recipe `<name>.json` next to it. The Recipe holds what the
 * user needs to make the same image again: prompt, seed, model, settings, time and seconds.
 *
 * Keep copies the PNG and the Recipe into `kept/`. A copy is simple and durable: the user can
 * delete the original folder contents and the kept images stay. The copy in `kept/` is the
 * source of truth for "kept", so no extra state file exists.
 */
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

export const IMAGES_FOLDER = "images";
const KEPT_FOLDER = "kept";

export interface Recipe {
  readonly version: 1;
  readonly source: string;
  readonly prompt: string;
  readonly seed: number;
  readonly modelId: string;
  readonly modelLabel: string;
  readonly settings: Readonly<Record<string, string | number>>;
  /** ISO time the image was made. */
  readonly createdAt: string;
  readonly seconds: number;
  /** File name of the PNG, without folders. */
  readonly file: string;
}

/** `20261015-143012` in UTC. Sorts by time. Safe in a Windows file name. */
export function timestampName(date: Date): string {
  const iso = date.toISOString();
  return `${iso.slice(0, 10).replaceAll("-", "")}-${iso.slice(11, 19).replaceAll(":", "")}`;
}

const safePart = (text: string) => text.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");

/** Base name for one image: time, model and seed. */
export function imageBaseName(date: Date, modelId: string, seed: number): string {
  return `${timestampName(date)}_${safePart(modelId)}_${String(seed)}`;
}

const exists = (path: string) =>
  NodeFSP.access(path).then(
    () => true,
    () => false,
  );

/** Picks `base`, or `base-2`, `base-3` when the name is taken. */
async function freeBaseName(dir: string, base: string): Promise<string> {
  let candidate = base;
  for (let n = 2; await exists(NodePath.join(dir, `${candidate}.png`)); n += 1) {
    candidate = `${base}-${String(n)}`;
  }
  return candidate;
}

export type RecipeInput = Omit<Recipe, "version" | "file">;

/** Writes the PNG first, then the Recipe, so a Recipe never points at a missing image. */
export async function saveImageWithRecipe(input: {
  readonly dir: string;
  readonly bytes: Uint8Array;
  readonly base: string;
  readonly recipe: RecipeInput;
}): Promise<{ readonly name: string; readonly pngPath: string; readonly recipePath: string }> {
  await NodeFSP.mkdir(input.dir, { recursive: true });
  const name = await freeBaseName(input.dir, input.base);
  const pngPath = NodePath.join(input.dir, `${name}.png`);
  const recipePath = NodePath.join(input.dir, `${name}.json`);
  const recipe: Recipe = { version: 1, ...input.recipe, file: `${name}.png` };
  await NodeFSP.writeFile(pngPath, input.bytes);
  await NodeFSP.writeFile(recipePath, `${JSON.stringify(recipe, null, 2)}\n`, "utf8");
  return { name, pngPath, recipePath };
}

export function parseRecipe(text: string): Recipe | null {
  try {
    const value = JSON.parse(text) as Partial<Recipe> | null;
    if (
      value !== null &&
      typeof value === "object" &&
      value.version === 1 &&
      typeof value.prompt === "string" &&
      typeof value.seed === "number" &&
      typeof value.modelId === "string" &&
      typeof value.file === "string" &&
      typeof value.createdAt === "string"
    ) {
      return {
        version: 1,
        source: typeof value.source === "string" ? value.source : "comfyui",
        prompt: value.prompt,
        seed: value.seed,
        modelId: value.modelId,
        modelLabel: typeof value.modelLabel === "string" ? value.modelLabel : value.modelId,
        settings: value.settings ?? {},
        createdAt: value.createdAt,
        seconds: typeof value.seconds === "number" ? value.seconds : 0,
        file: NodePath.basename(value.file),
      };
    }
  } catch {
    // A broken sidecar is skipped.
  }
  return null;
}

export interface StoredImage {
  readonly name: string;
  readonly recipe: Recipe;
  readonly kept: boolean;
}

/** Reads the newest Recipes in the folder. A missing folder gives an empty list. */
export async function readStoredImages(dir: string, limit: number): Promise<StoredImage[]> {
  const names = await NodeFSP.readdir(dir).catch(() => [] as string[]);
  const newest = names
    .filter((name) => name.endsWith(".json"))
    .toSorted()
    .reverse();
  const stored: StoredImage[] = [];
  for (const jsonName of newest) {
    if (stored.length >= limit) break;
    const text = await NodeFSP.readFile(NodePath.join(dir, jsonName), "utf8").catch(() => null);
    const recipe = text === null ? null : parseRecipe(text);
    if (!recipe) continue;
    const name = jsonName.slice(0, -".json".length);
    if (!(await exists(NodePath.join(dir, `${name}.png`)))) continue;
    stored.push({
      name,
      recipe,
      kept: await exists(NodePath.join(dir, KEPT_FOLDER, `${name}.png`)),
    });
  }
  return stored;
}

/** Copies the image and its Recipe into `kept/`, or removes those copies. */
export async function setKept(dir: string, name: string, kept: boolean): Promise<void> {
  const keptDir = NodePath.join(dir, KEPT_FOLDER);
  if (kept) {
    await NodeFSP.mkdir(keptDir, { recursive: true });
    for (const extension of [".png", ".json"]) {
      await NodeFSP.copyFile(
        NodePath.join(dir, `${name}${extension}`),
        NodePath.join(keptDir, `${name}${extension}`),
      );
    }
    return;
  }
  for (const extension of [".png", ".json"]) {
    await NodeFSP.rm(NodePath.join(keptDir, `${name}${extension}`), { force: true });
  }
}
