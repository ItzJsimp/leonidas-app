// @effect-diagnostics nodeBuiltinImport:off - Bounded file read for the plain image worker.
import * as NodeFSP from "node:fs/promises";

export function validateReferenceImage(bytes: Uint8Array) {
  if (bytes.byteLength < 33) throw new Error("The PNG header is invalid.");
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452)
    throw new Error("The PNG header is invalid.");
  if (
    !signature.every((value, index) => bytes[index] === value) ||
    !width ||
    !height ||
    width > 8192 ||
    height > 8192 ||
    width * height > 16 * 1024 ** 2
  )
    throw new Error("Choose a PNG image with at most 16 million pixels.");
  return { width, height };
}

/** Read through one handle so replacement files cannot bypass the size check. */
export async function readReferenceImage(file: string): Promise<Uint8Array> {
  const handle = await NodeFSP.open(file, "r");
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 33 || stat.size > 32 * 1024 ** 2)
      throw new Error("Choose a PNG image smaller than 32 MB.");
    const bytes = new Uint8Array(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) throw new Error("The reference image changed. Select it again.");
      offset += bytesRead;
    }
    validateReferenceImage(bytes);
    return bytes;
  } finally {
    await handle.close();
  }
}
