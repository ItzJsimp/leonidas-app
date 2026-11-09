// @effect-diagnostics nodeBuiltinImport:off - Real temporary files verify the streaming download boundary.
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { downloadImageAsset } from "./imageDownload.ts";

const homes: string[] = [];
afterEach(async () => {
  await Promise.all(
    homes.splice(0).map((home) => NodeFSP.rm(home, { recursive: true, force: true })),
  );
});

async function fixture() {
  const home = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "images download "));
  homes.push(home);
  const bytes = Buffer.from("verified model bytes");
  return {
    bytes,
    asset: {
      url: "https://example.test/model",
      file: NodePath.join(home, "model.safetensors"),
      size: bytes.length,
      sha256: NodeCrypto.createHash("sha256").update(bytes).digest("hex"),
    },
  };
}

describe("downloadImageAsset", () => {
  it("rejects a mismatched resume range without changing the partial file", async () => {
    const { asset, bytes } = await fixture();
    await NodeFSP.writeFile(`${asset.file}.part`, bytes.subarray(0, 5));
    await expect(
      downloadImageAsset(asset, {
        fetch: (async () =>
          new Response(bytes.subarray(5), {
            status: 206,
            headers: { "content-range": `bytes 0-14/${bytes.length}` },
          })) as typeof fetch,
      }),
    ).rejects.toThrow(/invalid file range/);
    expect(await NodeFSP.readFile(`${asset.file}.part`)).toEqual(bytes.subarray(0, 5));
  });

  it("keeps partial bytes when the connection ends early", async () => {
    const { asset, bytes } = await fixture();
    await expect(
      downloadImageAsset(asset, {
        fetch: (async () => new Response(bytes.subarray(0, 5))) as typeof fetch,
      }),
    ).rejects.toThrow(/stopped early/);
    expect(await NodeFSP.readFile(`${asset.file}.part`)).toEqual(bytes.subarray(0, 5));
    await expect(NodeFSP.stat(asset.file)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("stops before a request when the drive cannot hold the file", async () => {
    const { asset } = await fixture();
    await expect(
      downloadImageAsset(
        { ...asset, size: Number.MAX_SAFE_INTEGER },
        {
          fetch: (async () => {
            throw new Error("Must not request bytes");
          }) as typeof fetch,
        },
      ),
    ).rejects.toThrow(/not enough free space/);
  });

  it("does not publish a response larger than its pinned size", async () => {
    const { asset, bytes } = await fixture();
    await expect(
      downloadImageAsset(asset, {
        fetch: (async () => new Response(Buffer.concat([bytes, bytes]))) as typeof fetch,
      }),
    ).rejects.toThrow(/larger than/);
    await expect(NodeFSP.stat(asset.file)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not start a cancelled download", async () => {
    const { asset } = await fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(downloadImageAsset(asset, { signal: controller.signal })).rejects.toThrow();
    await expect(NodeFSP.stat(`${asset.file}.part`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("resumes an interrupted download and publishes only verified bytes", async () => {
    const { asset, bytes } = await fixture();
    await NodeFSP.writeFile(`${asset.file}.part`, bytes.subarray(0, 5));
    let range: string | null = null;
    const progress: number[] = [];
    await downloadImageAsset(asset, {
      fetch: (async (_input, init) => {
        range = new Headers(init?.headers).get("range");
        return new Response(bytes.subarray(5), {
          status: 206,
          headers: { "content-range": `bytes 5-${bytes.length - 1}/${bytes.length}` },
        });
      }) as typeof fetch,
      onProgress: (received) => progress.push(received),
    });
    expect(range).toBe("bytes=5-");
    expect(await NodeFSP.readFile(asset.file)).toEqual(bytes);
    expect(progress.at(-1)).toBe(bytes.length);
    await expect(NodeFSP.stat(`${asset.file}.part`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("restarts when the server ignores Range", async () => {
    const { asset, bytes } = await fixture();
    await NodeFSP.writeFile(`${asset.file}.part`, bytes.subarray(0, 5));
    await downloadImageAsset(asset, { fetch: (async () => new Response(bytes)) as typeof fetch });
    expect(await NodeFSP.readFile(asset.file)).toEqual(bytes);
  });

  it("rejects corrupt bytes without publishing a model", async () => {
    const { asset } = await fixture();
    await expect(
      downloadImageAsset(asset, {
        fetch: (async () => new Response(Buffer.alloc(asset.size))) as typeof fetch,
      }),
    ).rejects.toThrow(/checksum/i);
    await expect(NodeFSP.stat(asset.file)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(NodeFSP.stat(`${asset.file}.part`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("reuses an existing verified file without a network request", async () => {
    const { asset, bytes } = await fixture();
    await NodeFSP.writeFile(asset.file, bytes);
    await downloadImageAsset(asset, {
      fetch: (async () => {
        throw new Error("Network must stay off");
      }) as typeof fetch,
    });
    expect(await NodeFSP.readFile(asset.file)).toEqual(bytes);
  });

  it("preserves an existing user file when its checksum differs", async () => {
    const { asset } = await fixture();
    await NodeFSP.writeFile(asset.file, "my existing model");
    await expect(downloadImageAsset(asset)).rejects.toThrow(/already exists/i);
    expect(await NodeFSP.readFile(asset.file, "utf8")).toBe("my existing model");
  });
});
