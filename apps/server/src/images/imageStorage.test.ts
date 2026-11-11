// @effect-diagnostics nodeBuiltinImport:off globalDate:off - Storage tests use fixed dates and owned temporary folders.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, beforeEach, expect, it } from "vite-plus/test";
import {
  cleanupExpiredImages,
  keepStoredImage,
  removeStoredImage,
  saveStoredImage,
} from "./imageStorage.ts";

let base: string;
let root: string;
const now = Date.parse("2026-11-10T12:00:00Z");
beforeEach(async () => {
  base = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "image-storage-"));
  root = NodePath.join(base, "project");
  await NodeFSP.mkdir(root);
});
afterEach(async () => {
  await NodeFSP.rm(base, { recursive: true, force: true });
});
const save = (name: string, age: number, workspaceRoot = root) =>
  saveStoredImage({
    workspaceRoot,
    base: name,
    bytes: new Uint8Array([1, 2, 3]),
    recipe: {
      source: "comfyui",
      prompt: "p",
      seed: 1,
      modelId: "flux2klein",
      modelLabel: "FLUX",
      settings: {},
      createdAt: new Date(now - age * 86400000).toISOString(),
      seconds: 1,
    },
  });

it("removes only expired app image pairs and protects kept, recent and unrelated files", async () => {
  const old = await save("20260901-120000_flux2klein_1", 70);
  const kept = await save("20260901-120000_flux2klein_2", 70);
  const fresh = await save("20261109-120000_flux2klein_3", 1);
  const custom = await save("my-own-file", 70);
  await keepStoredImage(root, kept.name, true);
  const names: string[] = [];
  expect(
    await cleanupExpiredImages({
      workspaceRoot: root,
      now,
      enabled: () => true,
      onRemoved: (name) => names.push(name),
    }),
  ).toBe(1);
  expect(names).toEqual([old.name]);
  await expect(NodeFSP.access(old.pngPath)).rejects.toMatchObject({ code: "ENOENT" });
  for (const item of [kept, fresh, custom])
    await expect(NodeFSP.access(item.pngPath)).resolves.toBeUndefined();
});

it("does nothing without consent and stops when cleanup is disabled", async () => {
  for (let i = 0; i < 3; i += 1) await save(`20260901-120000_flux2klein_${i}`, 70);
  expect(
    await cleanupExpiredImages({
      workspaceRoot: root,
      now,
      enabled: () => false,
      onRemoved: () => {},
    }),
  ).toBe(0);
  let enabled = true;
  expect(
    await cleanupExpiredImages({
      workspaceRoot: root,
      now,
      enabled: () => enabled,
      onRemoved: () => {
        enabled = false;
      },
    }),
  ).toBe(1);
  expect(
    (await NodeFSP.readdir(NodePath.join(root, "images"))).filter((name) => name.endsWith(".png")),
  ).toHaveLength(2);
});

it("serializes Keep with cleanup and gives simultaneous imports different names", async () => {
  const [first, second] = await Promise.all([
    save("20260901-120000_flux2klein_1", 70),
    save("20260901-120000_flux2klein_1", 70),
  ]);
  expect(first.name).not.toBe(second.name);
  const keeping = keepStoredImage(root, first.name, true);
  const cleaning = cleanupExpiredImages({
    workspaceRoot: root,
    now,
    enabled: () => true,
    onRemoved: () => {},
  });
  await keeping;
  expect(await cleaning).toBe(1);
  await expect(NodeFSP.access(first.pngPath)).resolves.toBeUndefined();
});

it("deletes both kept and ordinary copies only in the selected project", async () => {
  const image = await save("20260901-120000_flux2klein_1", 70);
  const otherRoot = NodePath.join(base, "other");
  await NodeFSP.mkdir(otherRoot);
  const other = await save(image.name, 70, otherRoot);
  await keepStoredImage(root, image.name, true);
  await removeStoredImage(root, image.name);
  expect(await NodeFSP.readdir(NodePath.join(root, "images", "kept"))).toEqual([]);
  await expect(NodeFSP.access(image.pngPath)).rejects.toMatchObject({ code: "ENOENT" });
  await expect(NodeFSP.access(other.pngPath)).resolves.toBeUndefined();
  await expect(removeStoredImage(root, "../other")).rejects.toThrow("file name");
});

it("refuses an Images directory that links outside the project", async () => {
  const outside = NodePath.join(base, "outside");
  await NodeFSP.mkdir(outside);
  await NodeFSP.writeFile(NodePath.join(outside, "untouched.png"), "original");
  await NodeFSP.symlink(outside, NodePath.join(root, "images"), "junction");
  await expect(removeStoredImage(root, "untouched")).rejects.toThrow("outside this project");
  expect(await NodeFSP.readFile(NodePath.join(outside, "untouched.png"), "utf8")).toBe("original");
});
