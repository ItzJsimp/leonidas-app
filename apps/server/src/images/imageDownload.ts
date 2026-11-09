// @effect-diagnostics nodeBuiltinImport:off - Plain streaming file boundary used by the Images service.
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";

interface ImageAsset {
  readonly url: string;
  readonly file: string;
  readonly size: number;
  readonly sha256: string;
}

async function existingSize(file: string): Promise<number | null> {
  try {
    const stat = await NodeFSP.lstat(file);
    if (!stat.isFile()) throw new Error("The download path must be a regular file.");
    return stat.size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function checksum(file: string, signal?: AbortSignal) {
  const hash = NodeCrypto.createHash("sha256");
  for await (const chunk of NodeFS.createReadStream(file)) {
    signal?.throwIfAborted();
    hash.update(chunk);
  }
  return hash.digest("hex");
}

/** Check an existing model without writing to it or requesting any network data. */
export async function verifyImageAsset(
  file: string,
  size: number,
  sha256: string,
  signal?: AbortSignal,
) {
  return (await existingSize(file)) === size && (await checksum(file, signal)) === sha256;
}

/** Call once per destination. Partial files stay available after cancellation or network failure. */
export async function downloadImageAsset(
  asset: ImageAsset,
  options: {
    readonly fetch?: typeof fetch;
    readonly signal?: AbortSignal | undefined;
    readonly onProgress?: (received: number) => void;
  } = {},
): Promise<void> {
  if (
    !asset.url.startsWith("https://") ||
    !/^[a-f0-9]{64}$/.test(asset.sha256) ||
    !Number.isSafeInteger(asset.size) ||
    asset.size <= 0
  ) {
    throw new Error("The image download has invalid verification details.");
  }
  options.signal?.throwIfAborted();
  const present = await existingSize(asset.file);
  if (present !== null) {
    if (present === asset.size && (await checksum(asset.file, options.signal)) === asset.sha256) {
      options.onProgress?.(present);
      return;
    }
    throw new Error("A different file already exists. Choose another model folder.");
  }
  const partial = `${asset.file}.part`;
  await NodeFSP.mkdir(NodePath.dirname(asset.file), { recursive: true });
  let received = (await existingSize(partial)) ?? 0;
  if (received > asset.size) {
    await NodeFSP.unlink(partial);
    received = 0;
  }
  const disk = await NodeFSP.statfs(NodePath.dirname(asset.file));
  if (disk.bavail * disk.bsize < asset.size - received) {
    throw new Error("There is not enough free space. Choose another drive.");
  }
  if (received < asset.size) {
    const signal = AbortSignal.any([
      ...(options.signal ? [options.signal] : []),
      AbortSignal.timeout(30 * 60_000),
    ]);
    const response = await (options.fetch ?? fetch)(asset.url, {
      headers: received > 0 ? { Range: `bytes=${received}-` } : {},
      signal,
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error(`The image download failed (${response.status}). Try again.`);
    }
    if (response.status === 206) {
      const expected = `bytes ${received}-${asset.size - 1}/${asset.size}`;
      if (response.headers.get("content-range") !== expected) {
        await response.body.cancel();
        throw new Error("The download server sent an invalid file range. Try again.");
      }
    } else if (response.status === 200) {
      received = 0;
    } else {
      await response.body.cancel();
      throw new Error("The download server sent an unexpected response. Try again.");
    }
    const file = await NodeFSP.open(partial, received > 0 ? "a" : "w");
    const reader = response.body.getReader();
    try {
      options.onProgress?.(received);
      for (;;) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        if (received + value.byteLength > asset.size) {
          throw new Error("The download is larger than the verified file size.");
        }
        let offset = 0;
        while (offset < value.byteLength) {
          const { bytesWritten } = await file.write(value, offset);
          offset += bytesWritten;
        }
        received += value.byteLength;
        options.onProgress?.(received);
      }
    } finally {
      try {
        await reader.cancel();
      } finally {
        await file.close();
      }
    }
  }
  options.signal?.throwIfAborted();
  if (received !== asset.size)
    throw new Error("The download stopped early. Try again to resume it.");
  if ((await checksum(partial, options.signal)) !== asset.sha256) {
    await NodeFSP.unlink(partial);
    throw new Error("The download checksum failed. Try again to download a fresh copy.");
  }
  // A hard link publishes atomically and never replaces an existing user file.
  await NodeFSP.link(partial, asset.file);
  await NodeFSP.unlink(partial);
}
