// @effect-diagnostics nodeBuiltinImport:off - temp folders for a pure file check.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { describe, expect, it } from "@effect/vitest";

import {
  LAYA_FILES,
  LAYA_RELEASE_URL,
  commitModelSwap,
  layaPaths,
  layaStatus,
  plainInstallError,
  rollbackModelSwap,
  sha256OfFile,
  startModelSwap,
  wireLayaProject,
} from "./layaSetup.ts";

describe("layaSetup", () => {
  it("puts the pack and the model under the per-user .leonidas folder", () => {
    const paths = layaPaths("/home/u");
    expect(paths.pack).toBe(NodePath.join("/home/u", ".leonidas", "laya"));
    expect(paths.model).toBe(NodePath.join("/home/u", ".leonidas", "models", "laya"));
  });

  it("pins a 64 character SHA-256 for every download", () => {
    for (const file of LAYA_FILES) expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes a file", async () => {
    const dir = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "laya-test-"));
    const file = NodePath.join(dir, "a.txt");
    await NodeFSP.writeFile(file, "abc");
    expect(await sha256OfFile(file)).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    await NodeFSP.rm(dir, { recursive: true, force: true });
  });

  it("downloads the v2 model and pins its SHA-256", () => {
    expect(LAYA_RELEASE_URL).toContain("laya-model-v2");
    const model = LAYA_FILES.find((file) => file.name === "laya_int8.onnx");
    expect(model?.sha256).toBe("e26d64401cf4ab138c516aa1f88f5a14d9e009d9a4955682beb2bc1bf83c620c");
  });

  const installedHome = async (modelBytes: string) => {
    const home = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "laya-home-"));
    const paths = layaPaths(home);
    await NodeFSP.mkdir(paths.pack, { recursive: true });
    await NodeFSP.mkdir(paths.model, { recursive: true });
    await NodeFSP.writeFile(NodePath.join(paths.pack, "engine.py"), "");
    await NodeFSP.writeFile(NodePath.join(paths.model, "laya_int8.onnx"), modelBytes);
    return home;
  };
  const ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

  it("reports ready when the installed model matches the pinned hash", async () => {
    const home = await installedHome("abc");
    expect((await layaStatus(home, ABC)).status).toBe("ready");
    await NodeFSP.rm(home, { recursive: true, force: true });
  });

  it("reports update-available when the installed model is an older file", async () => {
    const home = await installedHome("an older model");
    const result = await layaStatus(home, ABC);
    expect(result.status).toBe("update-available");
    expect(result.message).toContain("Update");
    await NodeFSP.rm(home, { recursive: true, force: true });
  });
});

describe("model swap", () => {
  const setup = async (existing: string | null) => {
    const dir = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "laya-swap-"));
    if (existing !== null) await NodeFSP.writeFile(NodePath.join(dir, "m.onnx"), existing);
    await NodeFSP.writeFile(NodePath.join(dir, "m.onnx.part"), "new");
    return dir;
  };
  const read = (dir: string, name: string) => NodeFSP.readFile(NodePath.join(dir, name), "utf8");
  const has = (dir: string, name: string) =>
    NodeFSP.stat(NodePath.join(dir, name)).then(
      () => true,
      () => false,
    );

  it("puts the new file in place and keeps the old one until commit", async () => {
    const dir = await setup("old");
    await startModelSwap(dir, "m.onnx");
    expect(await read(dir, "m.onnx")).toBe("new");
    expect(await read(dir, "m.onnx.previous")).toBe("old");
    await commitModelSwap(dir, "m.onnx");
    expect(await has(dir, "m.onnx.previous")).toBe(false);
    await NodeFSP.rm(dir, { recursive: true, force: true });
  });

  it("restores the old file when the swap is rolled back", async () => {
    const dir = await setup("old");
    await startModelSwap(dir, "m.onnx");
    await rollbackModelSwap(dir, "m.onnx");
    expect(await read(dir, "m.onnx")).toBe("old");
    expect(await has(dir, "m.onnx.previous")).toBe(false);
    await NodeFSP.rm(dir, { recursive: true, force: true });
  });

  it("works on a first install and removes the file on rollback", async () => {
    const dir = await setup(null);
    await startModelSwap(dir, "m.onnx");
    expect(await read(dir, "m.onnx")).toBe("new");
    await rollbackModelSwap(dir, "m.onnx");
    expect(await has(dir, "m.onnx")).toBe(false);
    await NodeFSP.rm(dir, { recursive: true, force: true });
  });
});

describe("wireLayaProject", () => {
  it("refuses a missing folder", async () => {
    const result = await wireLayaProject({ projectPath: "/no/such/laya/folder", confirmed: false });
    expect(result.status).toBe("error");
  });

  it("asks for confirmation before writing into a SimplyGersi folder", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "laya-wire-"));
    const folder = NodePath.join(root, "SimplyGersi AIOS");
    await NodeFSP.mkdir(folder);
    const result = await wireLayaProject({ projectPath: folder, confirmed: false });
    expect(result.status).toBe("error");
    expect(result.message).toContain("Confirm");
    expect(await NodeFSP.readdir(folder)).toEqual([]);
    await NodeFSP.rm(root, { recursive: true, force: true });
  });

  it("asks to install first when the pack is missing", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "laya-wire-"));
    const result = await wireLayaProject({ projectPath: root, confirmed: false, home: root });
    expect(result.message).toContain("Install Laya first");
    await NodeFSP.rm(root, { recursive: true, force: true });
  });
});

describe("plainInstallError", () => {
  it("turns a full disk into plain words", () => {
    const error = Object.assign(new Error("ENOSPC: no space left on device, write"), {
      code: "ENOSPC",
    });
    expect(plainInstallError(error)).toBe("The disk is full. Free some space, then try again.");
  });

  it("explains a model file that is in use", () => {
    const error = Object.assign(new Error("EBUSY: resource busy or locked"), { code: "EBUSY" });
    expect(plainInstallError(error)).toBe(
      "Laya is in use right now. Close your other agent sessions, then try again.",
    );
  });

  it("never shows a raw system message", () => {
    expect(plainInstallError(new Error("EBADF: weird"))).toBe("The install failed. Try again.");
  });
});
