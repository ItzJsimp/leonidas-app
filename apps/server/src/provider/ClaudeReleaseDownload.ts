// @effect-diagnostics nodeBuiltinImport:off - Node supplies the incremental SHA-256 digest.
import * as NodeCrypto from "node:crypto";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

const BASE = "https://downloads.claude.ai/claude-code-releases";
const Version = Schema.String.check(Schema.isPattern(/^\d+\.\d+\.\d+$/u));
const Manifest = Schema.Struct({
  platforms: Schema.Record(
    Schema.String,
    Schema.Struct({
      checksum: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/u)),
      size: Schema.Number.check(
        Schema.isInt(),
        Schema.isGreaterThan(0),
        Schema.isLessThanOrEqualTo(1_000_000_000),
      ),
    }),
  ),
});

export class ClaudeDownloadError extends Schema.TaggedError<ClaudeDownloadError>()(
  "ClaudeDownloadError",
  {
    detail: Schema.String,
  },
) {}
const isClaudeDownloadError = Schema.is(ClaudeDownloadError);
const decodeVersion = Schema.decodeUnknownEffect(Version);
const decodeManifest = Schema.decodeUnknownEffect(Manifest);
const fail = (detail: string) => new ClaudeDownloadError({ detail });

/** Partial files survive cancellation and failed transfers. Only verified files can execute. */
export const downloadClaudeRelease = Effect.fn("downloadClaudeRelease")(
  function* (input: {
    readonly directory: string;
    readonly platform: NodeJS.Platform;
    readonly arch: string;
    readonly onProgress: (downloadedBytes: number, totalBytes: number) => Effect.Effect<void>;
  }) {
    const http = yield* HttpClient.HttpClient;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (
      !["win32", "darwin", "linux"].includes(input.platform) ||
      !["x64", "arm64"].includes(input.arch)
    ) {
      return yield* fail("Automatic Claude repair is not available on this computer.");
    }
    const get = (url: string) =>
      http.get(url).pipe(Effect.flatMap(HttpClientResponse.filterStatusOk));
    const target = `${input.platform}-${input.arch}`;
    yield* fs.makeDirectory(input.directory, { recursive: true });
    const entries = yield* fs.readDirectory(input.directory);
    const suffix = `-${target}.download`;
    const partial = entries.find(
      (entry) => entry.endsWith(suffix) && /^\d+\.\d+\.\d+$/u.test(entry.slice(0, -suffix.length)),
    );
    // Finish an interrupted release even if Anthropic publishes another version meanwhile.
    const version = partial
      ? partial.slice(0, -suffix.length)
      : yield* get(`${BASE}/latest`).pipe(
          Effect.flatMap((response) => response.text),
          Effect.flatMap((text) => decodeVersion(text.trim())),
          Effect.timeout("30 seconds"),
        );
    const manifest = yield* get(`${BASE}/${version}/manifest.json`).pipe(
      Effect.flatMap((response) => response.json),
      Effect.flatMap(decodeManifest),
      Effect.timeout("30 seconds"),
    );
    const asset = manifest.platforms[target];
    if (!asset) return yield* fail("The official Claude download does not support this computer.");
    // Keep one release in this repair cache. Other files do not belong to this operation.
    for (const entry of entries) {
      if (
        /^\d+\.\d+\.\d+-[\w-]+(?:\.download|\.exe)?$/u.test(entry) &&
        !entry.startsWith(`${version}-${target}`)
      ) {
        yield* fs.remove(path.join(input.directory, entry));
      }
    }
    const file = path.join(input.directory, `${version}-${target}.download`);
    const executablePath = path.join(
      input.directory,
      `${version}-${target}${input.platform === "win32" ? ".exe" : ""}`,
    );
    if (!(yield* fs.exists(file)) && (yield* fs.exists(executablePath))) {
      yield* fs.rename(executablePath, file);
    }
    let downloaded = yield* fs.stat(file).pipe(
      Effect.map((stat) => Number(stat.size)),
      Effect.orElseSucceed(() => 0),
    );
    if (downloaded > asset.size) {
      yield* fs.remove(file);
      downloaded = 0;
    }
    yield* input.onProgress(downloaded, asset.size);
    if (downloaded < asset.size) {
      const response = yield* http
        .execute(
          HttpClientRequest.get(
            `${BASE}/${version}/${target}/claude${input.platform === "win32" ? ".exe" : ""}`,
            {
              headers: downloaded ? { Range: `bytes=${downloaded}-` } : {},
            },
          ),
        )
        .pipe(Effect.flatMap(HttpClientResponse.filterStatusOk));
      if (response.status === 206) {
        const expectedRange = `bytes ${downloaded}-${asset.size - 1}/${asset.size}`;
        if (response.headers["content-range"] !== expectedRange)
          return yield* fail(
            "The download server returned an incorrect file range. Nothing was installed.",
          );
      } else if (response.status === 200) {
        downloaded = 0;
      } else
        return yield* fail(
          "The download server returned an unexpected response. Nothing was installed.",
        );
      let lastProgress = yield* Clock.currentTimeMillis;
      yield* response.stream.pipe(
        Stream.tap((chunk) =>
          Effect.gen(function* () {
            downloaded += chunk.byteLength;
            if (downloaded > asset.size)
              return yield* fail(
                "The Claude download exceeded the expected size. Nothing was installed.",
              );
            const now = yield* Clock.currentTimeMillis;
            if (now - lastProgress >= 250 || downloaded === asset.size) {
              lastProgress = now;
              yield* input.onProgress(downloaded, asset.size);
            }
          }),
        ),
        Stream.run(fs.sink(file, { flag: response.status === 206 ? "a" : "w", mode: 0o600 })),
        Effect.timeout("45 minutes"),
      );
    }
    if (downloaded !== asset.size)
      return yield* fail("The download stopped early. Repair Claude resumes the saved download.");
    const hash = NodeCrypto.createHash("sha256");
    yield* fs.stream(file).pipe(
      Stream.runForEach((chunk) =>
        Effect.sync(() => {
          hash.update(chunk);
        }),
      ),
    );
    if (hash.digest("hex") !== asset.checksum) {
      yield* fs.remove(file);
      return yield* fail(
        "The Claude download failed verification. Nothing was installed. Select Repair Claude to download it again.",
      );
    }
    yield* fs.rename(file, executablePath);
    if (input.platform !== "win32") yield* fs.chmod(executablePath, 0o700);
    return { version, executablePath };
  },
  Effect.mapError((error) =>
    isClaudeDownloadError(error)
      ? error
      : fail(
          "Could not download Claude. Check the connection. If security software blocked Claude, review its protection history. Select Repair Claude to resume.",
        ),
  ),
);
