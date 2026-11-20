// @effect-diagnostics nodeBuiltinImport:off - the module hash uses node:crypto.
import { TradingStateError } from "@t3tools/contracts";
import { parseTradingPackJson, type TradingPack } from "@t3tools/trading";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as NodeCrypto from "node:crypto";

import { readWorkspaceFile } from "../taskBoard/aiosWorkspaces.ts";

/** Where the check module consent lives, inside the workspace's trading folder. */
const CONSENT_FILE = "pack-consent.json";
const Consent = Schema.Struct({
  module: Schema.String,
  sha256: Schema.String,
  allow: Schema.Boolean,
});
const decodeConsent = Schema.decodeUnknownOption(Schema.fromJsonString(Consent));
const encodeConsent = Schema.encodeSync(Schema.fromJsonString(Consent));

/** `pending` until the trader allows or declines this exact module (by its SHA-256). */
export type PackCheck =
  | { readonly status: "none" }
  | { readonly status: "missing"; readonly module: string }
  | {
      readonly status: "pending" | "allowed" | "declined";
      readonly module: string;
      readonly sha256: string;
      /** The bytes the hash covers. Run these, never the file again. */
      readonly source: Uint8Array;
    };

export type LinkedPack =
  | { readonly status: "none" }
  | { readonly status: "invalid"; readonly folder: string; readonly reason: string }
  | {
      readonly status: "ready";
      readonly folder: string;
      readonly pack: TradingPack;
      readonly check: PackCheck;
    };

export const inside = (path: Path.Path, folder: string, file: string) => {
  const relative = path.relative(folder, file);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
};

const readConsent = (file: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    if (!(yield* fs.exists(file))) return null;
    return Option.getOrNull(decodeConsent(yield* fs.readFileString(file)));
  });

/**
 * Reads the pack the workspace links in `workspace.json` (`crewPack`, a folder path, relative to
 * the workspace or absolute). A missing or bad pack is reported, never thrown: the tracker works
 * without one.
 */
export const readLinkedPack = Effect.fn("trading.readLinkedPack")(function* (root: string) {
  const workspace = readWorkspaceFile(root);
  const link = workspace.status === "ready" ? workspace.file.crewPack : undefined;
  if (link === undefined) return { status: "none" } satisfies LinkedPack;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const folder = path.resolve(root, link);
  const text = yield* fs
    .readFileString(path.join(folder, "trading-pack.json"))
    .pipe(Effect.orElseSucceed(() => null));
  if (text === null) {
    return {
      status: "invalid",
      folder,
      reason: "trading-pack.json not found",
    } satisfies LinkedPack;
  }
  let pack: TradingPack;
  try {
    pack = parseTradingPackJson(text);
  } catch (error) {
    return {
      status: "invalid",
      folder,
      reason: error instanceof Error ? error.message : "bad pack",
    } satisfies LinkedPack;
  }
  if (pack.checkModule === undefined) {
    return { status: "ready", folder, pack, check: { status: "none" } } satisfies LinkedPack;
  }
  const module = path.join(folder, pack.checkModule);
  // A link inside the pack must not point outside it.
  const real = yield* Effect.all([fs.realPath(folder), fs.realPath(module)]).pipe(
    Effect.orElseSucceed(() => null),
  );
  const bytes =
    real && inside(path, real[0], real[1])
      ? yield* fs.readFile(module).pipe(Effect.orElseSucceed(() => null))
      : null;
  if (bytes === null) {
    return {
      status: "ready",
      folder,
      pack,
      check: { status: "missing", module },
    } satisfies LinkedPack;
  }
  const sha256 = NodeCrypto.createHash("sha256").update(bytes).digest("hex");
  const consent = yield* readConsent(path.join(root, "trading", CONSENT_FILE)).pipe(
    Effect.orElseSucceed(() => null),
  );
  const status =
    consent && consent.module === module && consent.sha256 === sha256
      ? consent.allow
        ? "allowed"
        : "declined"
      : "pending";
  return {
    status: "ready",
    folder,
    pack,
    check: { status, module, sha256, source: bytes },
  } satisfies LinkedPack;
});

/**
 * Records the trader's answer for the module they saw. `sha256` is the hash the prompt showed: if
 * the module changed since, nothing is saved and the trader is asked again.
 */
export const savePackConsent = Effect.fn("trading.savePackConsent")(function* (
  root: string,
  answer: { readonly allow: boolean; readonly sha256: string },
) {
  const linked = yield* readLinkedPack(root);
  if (
    linked.status !== "ready" ||
    linked.check.status === "none" ||
    linked.check.status === "missing"
  ) {
    return yield* new TradingStateError({ reason: "pack_not_found" });
  }
  if (linked.check.sha256 !== answer.sha256) {
    return yield* new TradingStateError({ reason: "pack_changed" });
  }
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const text = `${encodeConsent({ module: linked.check.module, sha256: answer.sha256, allow: answer.allow })}\n`;
  yield* fs.makeDirectory(path.join(root, "trading"), { recursive: true }).pipe(
    Effect.andThen(fs.writeFileString(path.join(root, "trading", CONSENT_FILE), text)),
    Effect.mapError(() => new TradingStateError({ reason: "read_failed" })),
  );
});
