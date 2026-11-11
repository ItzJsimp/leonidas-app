// @effect-diagnostics nodeBuiltinImport:off - Tests use isolated temporary files.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { it, expect } from "vite-plus/test";
import { readReferenceImage } from "./readReferenceImage.ts";

it("accepts PNG references and rejects oversized files and pixel dimensions", async () => {
  const dir = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "image-reference-"));
  const file = NodePath.join(dir, "reference.png");
  try {
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGUlEQVR4nGNgaGD4TxEeNWDUgFED/g8TAwDrCH8Qy9YD6gAAAABJRU5ErkJggg==",
      "base64",
    );
    await NodeFSP.writeFile(file, png);
    expect(await readReferenceImage(file)).toEqual(new Uint8Array(png));
    png.writeUInt32BE(100000, 16);
    await NodeFSP.writeFile(file, png);
    await expect(readReferenceImage(file)).rejects.toThrow("16 million pixels");
    const handle = await NodeFSP.open(file, "w");
    await handle.truncate(32 * 1024 ** 2 + 1);
    await handle.close();
    await expect(readReferenceImage(file)).rejects.toThrow("32 MB");
  } finally {
    await NodeFSP.rm(dir, { recursive: true, force: true });
  }
});
