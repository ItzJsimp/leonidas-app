// @effect-diagnostics nodeBuiltinImport:off - Project image storage uses bounded native file operations.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import {
  IMAGES_FOLDER,
  parseRecipe,
  saveImageWithRecipe,
  setKept,
  type RecipeInput,
} from "./recipe.ts";

const locks = new Map<string, Promise<void>>();
const GENERATED_NAME = /^\d{8}-\d{6}_[a-zA-Z0-9-]+_\d+(?:-\d+)?$/;

async function locked<A>(root: string, name: string, work: () => Promise<A>): Promise<A> {
  if (
    !name ||
    name === "." ||
    name === ".." ||
    NodePath.basename(name) !== name ||
    /[/\\]/.test(name)
  )
    throw new Error("The image file name is invalid.");
  const path = NodePath.resolve(root, IMAGES_FOLDER, name);
  const key = path.toLowerCase();
  if (!locks.has(key) && locks.size >= 256)
    throw new Error("Wait for image storage operations to finish.");
  const result = (locks.get(key) ?? Promise.resolve()).then(work);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  locks.set(key, tail);
  try {
    return await result;
  } finally {
    if (locks.get(key) === tail) locks.delete(key);
  }
}

const inside = (root: string, target: string) => {
  const relative = NodePath.relative(root, target);
  return (
    relative !== ".." && !relative.startsWith(`..${NodePath.sep}`) && !NodePath.isAbsolute(relative)
  );
};

async function ownedDirectory(root: string) {
  const realRoot = await NodeFSP.realpath(root);
  const dir = await NodeFSP.realpath(NodePath.join(root, IMAGES_FOLDER));
  if (!inside(realRoot, dir)) throw new Error("The Images folder points outside this project.");
  return dir;
}

async function fileStat(path: string) {
  try {
    return await NodeFSP.lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function removeFiles(root: string, name: string, kept: boolean) {
  const dir = await ownedDirectory(root);
  const paths: string[] = [];
  for (const folder of kept ? [dir, NodePath.join(dir, "kept")] : [dir]) {
    for (const extension of [".png", ".json"]) {
      const target = NodePath.join(folder, `${name}${extension}`);
      const stat = await fileStat(target);
      if (!stat) continue;
      if (!stat.isFile() || stat.isSymbolicLink() || !inside(dir, await NodeFSP.realpath(target)))
        throw new Error("Linked image files cannot be deleted here.");
      paths.push(target);
    }
  }
  for (const target of paths) {
    try {
      await NodeFSP.unlink(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export const keepStoredImage = (root: string, name: string, kept: boolean) =>
  locked(root, name, async () => {
    await setKept(await ownedDirectory(root), name, kept);
  });

export const removeStoredImage = (root: string, name: string) =>
  locked(root, name, () => removeFiles(root, name, true));

/** Serialize matching names so simultaneous imports cannot overwrite each other. */
export const saveStoredImage = (input: {
  readonly workspaceRoot: string;
  readonly base: string;
  readonly bytes: Uint8Array;
  readonly recipe: RecipeInput;
}) =>
  locked(input.workspaceRoot, input.base, async () => {
    await NodeFSP.mkdir(NodePath.join(input.workspaceRoot, IMAGES_FOLDER), { recursive: true });
    return saveImageWithRecipe({ ...input, dir: await ownedDirectory(input.workspaceRoot) });
  });

/** Delete only app-named image pairs. Kept images and links remain untouched. */
export async function cleanupExpiredImages(input: {
  readonly workspaceRoot: string;
  readonly now: number;
  readonly enabled: () => boolean;
  readonly onRemoved: (name: string) => void;
}) {
  if (!input.enabled()) return 0;
  let dir: string;
  try {
    dir = await ownedDirectory(input.workspaceRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
  const entries = await NodeFSP.opendir(dir);
  let removed = 0;
  for await (const entry of entries) {
    if (!input.enabled()) break;
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const name = entry.name.slice(0, -5);
    if (!GENERATED_NAME.test(name)) continue;
    const deleted = await locked(input.workspaceRoot, name, async () => {
      if (!input.enabled()) return false;
      const json = NodePath.join(dir, entry.name);
      const stat = await fileStat(json);
      if (!stat?.isFile() || stat.isSymbolicLink() || stat.size > 512 * 1024) return false;
      const recipe = parseRecipe(await NodeFSP.readFile(json, "utf8"));
      const createdAt = recipe ? Date.parse(recipe.createdAt) : NaN;
      if (
        !recipe ||
        recipe.file !== `${name}.png` ||
        !Number.isFinite(createdAt) ||
        createdAt >= input.now - 30 * 86400000
      )
        return false;
      if (await fileStat(NodePath.join(dir, "kept", `${name}.png`))) return false;
      await removeFiles(input.workspaceRoot, name, false);
      return true;
    });
    if (deleted) {
      removed += 1;
      input.onRemoved(name);
    }
  }
  return removed;
}
