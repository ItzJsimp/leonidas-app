// @effect-diagnostics nodeBuiltinImport:off - The fixture checks the native digest independently.
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { HttpClient, HttpClientResponse } from "effect/http";
import * as NodeCrypto from "node:crypto";

import { downloadClaudeRelease } from "./ClaudeReleaseDownload.ts";

const binary = new TextEncoder().encode("verified Claude test executable");
const checksum = NodeCrypto.createHash("sha256").update(binary).digest("hex");

const harness = (badChecksum = false, ignoreRange = false, latest = "2.1.325") =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const directory = yield* fs.makeTempDirectoryScoped();
    const ranges: Array<string | undefined> = [];
    const http = HttpClient.make((request) =>
      Effect.sync(() => {
        let response: Response;
        if (request.url.endsWith("/latest")) response = new Response(latest);
        else if (request.url.endsWith("/manifest.json"))
          response = Response.json({
            platforms: {
              "win32-x64": {
                checksum: badChecksum ? "0".repeat(64) : checksum,
                size: binary.length,
              },
            },
          });
        else {
          const range = request.headers.range;
          ranges.push(range);
          const offset = range && !ignoreRange ? Number(range.match(/\d+/u)?.[0]) : 0;
          response = new Response(binary.slice(offset), {
            status: offset ? 206 : 200,
            headers: offset
              ? { "content-range": `bytes ${offset}-${binary.length - 1}/${binary.length}` }
              : {},
          });
        }
        return HttpClientResponse.fromWeb(request, response);
      }),
    );
    const download = downloadClaudeRelease({
      directory,
      platform: "win32",
      arch: "x64",
      onProgress: () => Effect.void,
    }).pipe(Effect.provideService(HttpClient.HttpClient, http));
    return { directory, ranges, download, fs };
  });

it.effect("resumes a partial download and verifies its checksum", () =>
  Effect.gen(function* () {
    const h = yield* harness();
    yield* h.fs.writeFile(`${h.directory}/2.1.325-win32-x64.download`, binary.slice(0, 5));
    const result = yield* h.download;
    expect(h.ranges).toEqual(["bytes=5-"]);
    expect(Array.from(yield* h.fs.readFile(result.executablePath))).toEqual(Array.from(binary));
    expect(result.version).toBe("2.1.325");
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("resumes the same release when the latest version changes", () =>
  Effect.gen(function* () {
    const h = yield* harness(false, false, "2.1.326");
    yield* h.fs.writeFile(`${h.directory}/2.1.325-win32-x64.download`, binary.slice(0, 5));
    const result = yield* h.download;
    expect(result.version).toBe("2.1.325");
    expect(h.ranges).toEqual(["bytes=5-"]);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("restarts safely when the host ignores Range", () =>
  Effect.gen(function* () {
    const h = yield* harness(false, true);
    yield* h.fs.writeFile(`${h.directory}/2.1.325-win32-x64.download`, binary.slice(0, 5));
    const result = yield* h.download;
    expect(Array.from(yield* h.fs.readFile(result.executablePath))).toEqual(Array.from(binary));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("rejects and removes a download with an incorrect checksum", () =>
  Effect.gen(function* () {
    const h = yield* harness(true);
    const result = yield* h.download.pipe(Effect.result);
    expect(result._tag).toBe("Failure");
    expect(yield* h.fs.exists(`${h.directory}/2.1.325-win32-x64.download`)).toBe(false);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("reuses a verified download after installation failed", () =>
  Effect.gen(function* () {
    const h = yield* harness();
    const first = yield* h.download;
    const second = yield* h.download;
    expect(second.executablePath).toBe(first.executablePath);
    expect(h.ranges).toHaveLength(1);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
