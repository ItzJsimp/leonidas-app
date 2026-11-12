import { TradingStateError, type TradingScreenshotReadResult } from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { appendTradingEvents } from "./appendTradingEvents.ts";
import { requireTradingRoot } from "./readTradingState.ts";
import { readTradeIds } from "./tradingImports.ts";
import { childPath, requireDay } from "./tradingPaths.ts";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** The base64 text of a 5 MB image. Longer text is refused before any decoding. */
const MAX_BASE64_CHARACTERS = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;

type ImageMime = "image/png" | "image/jpeg" | "image/webp";
const EXTENSION: Readonly<Record<ImageMime, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const MIME_BY_EXTENSION: Readonly<Record<string, ImageMime>> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

/** Only names this server generates: 32 hex characters and a known extension. */
const GENERATED_NAME = /^[0-9a-f]{32}\.(png|jpg|webp)$/;

const ioFailed = () => new TradingStateError({ reason: "read_failed" });

/** The image type the first bytes show, or null. The client's type is never trusted. */
function imageType(bytes: Uint8Array): ImageMime | null {
  const at = (offset: number, ...values: readonly number[]) =>
    values.every((value, index) => bytes[offset + index] === value);
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

/**
 * Saves a pasted image under `trading/screenshots/<day>/` with a name the server makes. With a
 * `tradeId`, it also tags that trade with the new screenshot path.
 */
export const saveScreenshot = Effect.fn("trading.saveScreenshot")(function* (
  aiosRoot: string | null,
  input: {
    readonly day: string;
    readonly tradeId?: string | undefined;
    readonly mime: string;
    readonly dataBase64: string;
  },
) {
  const root = yield* requireTradingRoot(aiosRoot);
  const day = yield* requireDay(input.day);
  const extension = EXTENSION[input.mime as ImageMime];
  if (extension === undefined) return yield* new TradingStateError({ reason: "unsupported_image" });
  if (input.dataBase64.length > MAX_BASE64_CHARACTERS) {
    return yield* new TradingStateError({ reason: "image_too_large" });
  }
  const bytes = new Uint8Array(Buffer.from(input.dataBase64, "base64"));
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return yield* new TradingStateError({ reason: "image_too_large" });
  }
  if (imageType(bytes) !== input.mime) {
    return yield* new TradingStateError({ reason: "image_mismatch" });
  }
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const crypto = yield* Crypto.Crypto;
  if (input.tradeId !== undefined) {
    const known = yield* readTradeIds(root);
    if (!known.has(input.tradeId)) return yield* new TradingStateError({ reason: "unknown_trade" });
  }

  const name = `${(yield* crypto.randomUUIDv4().pipe(Effect.orDie)).replaceAll("-", "")}.${extension}`;
  const folder = path.join(root, "trading", "screenshots", day);
  const target = yield* childPath(folder, name);
  // Written under a dot name first, so a half-written image never has a real name.
  const temp = path.join(folder, `.${name}.tmp`);
  yield* fs.makeDirectory(folder, { recursive: true }).pipe(Effect.mapError(ioFailed));
  yield* fs.writeFile(temp, bytes).pipe(Effect.mapError(ioFailed));
  yield* fs.rename(temp, target).pipe(Effect.mapError(ioFailed));

  if (input.tradeId !== undefined) {
    yield* appendTradingEvents(root, [
      {
        id: yield* crypto.randomUUIDv4().pipe(Effect.orDie),
        at: DateTime.formatIso(yield* DateTime.now),
        kind: "trade.tagged",
        tradeId: input.tradeId,
        screenshot: `screenshots/${day}/${name}`,
      },
    ]);
  }
  return { name };
});

/** One saved screenshot as base64 with its type, for a thumbnail. */
export const readScreenshot = Effect.fn("trading.readScreenshot")(function* (
  aiosRoot: string | null,
  input: { readonly day: string; readonly name: string },
) {
  const root = yield* requireTradingRoot(aiosRoot);
  const day = yield* requireDay(input.day);
  if (!GENERATED_NAME.test(input.name)) {
    return yield* new TradingStateError({ reason: "invalid_name" });
  }
  const mime = MIME_BY_EXTENSION[input.name.slice(input.name.lastIndexOf(".") + 1)];
  if (mime === undefined) return yield* new TradingStateError({ reason: "invalid_name" });
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const folder = path.join(root, "trading", "screenshots", day);
  const file = yield* childPath(folder, input.name);
  if (!(yield* fs.exists(file).pipe(Effect.mapError(ioFailed)))) {
    return yield* new TradingStateError({ reason: "file_not_found" });
  }
  const size = yield* fs.stat(file).pipe(Effect.mapError(ioFailed));
  if (Number(size.size) > MAX_IMAGE_BYTES) {
    return yield* new TradingStateError({ reason: "image_too_large" });
  }
  const bytes = yield* fs.readFile(file).pipe(Effect.mapError(ioFailed));
  return {
    mime,
    dataBase64: Buffer.from(bytes).toString("base64"),
  } satisfies TradingScreenshotReadResult;
});
