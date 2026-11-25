// Delivers the core skills (ADR-0102) to providers that have no plugin option, such as Codex and Antigravity.
// Each core skill is copied into the user skill folder and tracked in a hash manifest, the way
// Hermes Agent ships its bundled skills. The app only touches a folder that it wrote and that the
// user has not changed. It never follows a link and never removes a skill it did not install.
// @effect-diagnostics nodeBuiltinImport:off - the folder hash needs sha256, and Effect has no hash of file bytes.
import * as NodeCrypto from "node:crypto";

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

import * as HostProcess from "@t3tools/shared/HostProcess";

export const CORE_SKILLS_MANIFEST_FILE = ".leonidas-core-skills.json";
// A sibling of the skill folder: same volume, so a rename is atomic, and no skill scan sees it.
export const CORE_SKILLS_STAGING_DIR = ".leonidas-skill-staging";

type Manifest = Record<string, string>;

const ManifestFile = Schema.fromJsonString(
  Schema.Struct({ version: Schema.Number, skills: Schema.Record(Schema.String, Schema.String) }),
);
const decodeManifestFile = Schema.decodeUnknownEffect(ManifestFile);
const encodeManifestFile = Schema.encodeEffect(ManifestFile);

export type CoreSkillLinkOutcome =
  | { readonly name: string; readonly action: "installed" | "updated" | "removed" | "unchanged" }
  // The user changed the installed copy, so the app left it alone.
  | { readonly name: string; readonly action: "kept-edited" }
  // A skill with this name exists that the app did not install, or the path is a link.
  | { readonly name: string; readonly action: "kept-user" };

export interface CoreSkillLinkReport {
  readonly outcomes: ReadonlyArray<CoreSkillLinkOutcome>;
}

const manifestRowPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

const isLink = Effect.fn("CoreSkillLinks.isLink")(function* (target: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  return yield* fileSystem.readLink(target).pipe(
    Effect.as(true),
    Effect.orElseSucceed(() => false),
  );
});

/** A hash of every file path and file content under a folder. Returns undefined when it is missing. */
const hashTree = Effect.fn("CoreSkillLinks.hashTree")(function* (directory: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const entries = yield* fileSystem
    .readDirectory(directory, { recursive: true })
    .pipe(Effect.orElseSucceed((): ReadonlyArray<string> | undefined => undefined));
  if (entries === undefined) return undefined;
  const hash = NodeCrypto.createHash("sha256");
  for (const entry of [...entries].map((e) => e.replaceAll("\\", "/")).toSorted()) {
    if (/(^|\/)(__pycache__)(\/|$)|\.pyc$/.test(entry)) continue;
    const full = path.join(directory, entry);
    const info = yield* fileSystem.stat(full).pipe(Effect.orElseSucceed(() => undefined));
    if (info?.type !== "File") continue;
    const content = yield* fileSystem
      .readFile(full)
      .pipe(Effect.orElseSucceed(() => new Uint8Array()));
    hash.update(`${entry}\0`).update(content);
  }
  return hash.digest("hex");
});

const copyTree = Effect.fn("CoreSkillLinks.copyTree")(function* (source: string, target: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const entries = yield* fileSystem.readDirectory(source, { recursive: true });
  yield* fileSystem.makeDirectory(target, { recursive: true });
  for (const entry of [...entries].toSorted()) {
    if (/(^|[\\/])(__pycache__)([\\/]|$)|\.pyc$/.test(entry)) continue;
    const from = path.join(source, entry);
    const to = path.join(target, entry);
    const info = yield* fileSystem.stat(from);
    if (info.type === "Directory") {
      yield* fileSystem.makeDirectory(to, { recursive: true });
    } else if (info.type === "File") {
      yield* fileSystem.makeDirectory(path.dirname(to), { recursive: true });
      yield* fileSystem.writeFile(to, yield* fileSystem.readFile(from));
    }
  }
});

const readManifest = Effect.fn("CoreSkillLinks.readManifest")(function* (file: string) {
  const fileSystem = yield* FileSystem.FileSystem;
  const parsed = yield* fileSystem.readFileString(file).pipe(
    Effect.flatMap(decodeManifestFile),
    Effect.orElseSucceed(() => undefined),
  );
  const rows: Manifest = {};
  for (const [name, hash] of Object.entries(parsed?.skills ?? {})) {
    if (manifestRowPattern.test(name)) rows[name] = hash;
  }
  return rows;
});

/** The skills in `targetDir` that the app installed. */
export const readCoreSkillNames = Effect.fn("readCoreSkillNames")(function* (targetDir: string) {
  const path = yield* Path.Path;
  const rows = yield* readManifest(path.join(targetDir, CORE_SKILLS_MANIFEST_FILE));
  return new Set(Object.keys(rows));
});

/**
 * Brings `targetDir` in line with the skills under `sourceDir` (one folder per skill).
 * - A new skill is copied and recorded.
 * - An installed skill that the user did not touch is updated when the source changed.
 * - An installed skill that the user edited is kept, and the report says so.
 * - A skill that left the source is removed when untouched. Its manifest row always goes.
 * - A folder with the same name that the app did not install is never touched.
 * - A skill folder that is itself a link is left alone, because it can point into a user repo.
 * The app can stop at any point: a skill folder moves in or out with one rename, and the manifest
 * row is saved before the folder appears. The next run then finishes the work.
 */
export const syncCoreSkillLinks = Effect.fn("syncCoreSkillLinks")(function* (input: {
  readonly sourceDir: string;
  readonly targetDir: string;
}) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const outcomes: CoreSkillLinkOutcome[] = [];
  if (yield* isLink(input.targetDir)) {
    yield* Effect.logInfo(`Core skills not copied: ${input.targetDir} is a link.`);
    return { outcomes };
  }
  const names = (yield* fileSystem.readDirectory(input.sourceDir))
    .filter((name) => manifestRowPattern.test(name))
    .toSorted();
  const manifestFile = path.join(input.targetDir, CORE_SKILLS_MANIFEST_FILE);
  const manifest = yield* readManifest(manifestFile);
  const next: Manifest = { ...manifest };
  const staging = path.join(path.dirname(input.targetDir), CORE_SKILLS_STAGING_DIR);
  yield* fileSystem.remove(staging, { recursive: true, force: true });
  yield* fileSystem.makeDirectory(input.targetDir, { recursive: true });
  const saveManifest = Effect.fnUntraced(function* () {
    const draft = `${manifestFile}.tmp`;
    yield* fileSystem.writeFileString(
      draft,
      yield* encodeManifestFile({ version: 1, skills: next }),
    );
    yield* fileSystem.rename(draft, manifestFile);
  });
  // Moves a skill folder out of the way in one step. The staging folder is deleted afterwards.
  const retire = Effect.fnUntraced(function* (name: string) {
    yield* fileSystem.makeDirectory(path.join(staging, "old"), { recursive: true });
    yield* fileSystem.rename(path.join(input.targetDir, name), path.join(staging, "old", name));
  });
  const place = Effect.fnUntraced(function* (name: string, replace: boolean) {
    const draft = path.join(staging, "new", name);
    yield* copyTree(path.join(input.sourceDir, name), draft);
    const hash = yield* hashTree(draft);
    if (hash === undefined) return;
    if (replace) yield* retire(name);
    next[name] = hash;
    yield* saveManifest();
    yield* fileSystem.rename(draft, path.join(input.targetDir, name));
  });

  for (const name of names) {
    const target = path.join(input.targetDir, name);
    const sourceHash = yield* hashTree(path.join(input.sourceDir, name));
    if (sourceHash === undefined) continue;
    const recorded = manifest[name];
    if (!(yield* fileSystem.exists(target))) {
      yield* place(name, false);
      outcomes.push({ name, action: "installed" });
      continue;
    }
    if (recorded === undefined || (yield* isLink(target))) {
      delete next[name];
      outcomes.push({ name, action: "kept-user" });
      continue;
    }
    if ((yield* hashTree(target)) !== recorded) {
      outcomes.push({ name, action: "kept-edited" });
      continue;
    }
    if (recorded === sourceHash) {
      outcomes.push({ name, action: "unchanged" });
      continue;
    }
    yield* place(name, true);
    outcomes.push({ name, action: "updated" });
  }

  const shipped = new Set(names);
  for (const [name, recorded] of Object.entries(manifest)) {
    if (shipped.has(name)) continue;
    const target = path.join(input.targetDir, name);
    delete next[name];
    if (!(yield* fileSystem.exists(target))) continue;
    if (!(yield* isLink(target)) && (yield* hashTree(target)) === recorded) {
      yield* retire(name);
      outcomes.push({ name, action: "removed" });
    } else {
      outcomes.push({ name, action: "kept-edited" });
    }
  }

  yield* saveManifest();
  yield* fileSystem.remove(staging, { recursive: true, force: true });
  return { outcomes };
});

// Provider instances can share one home, so only one sync runs at a time.
const syncLock = Semaphore.makeUnsafe(1);

/**
 * Syncs the core skills into a provider's user skill folder, from the plugin folder the desktop
 * unpacked. It does nothing without that folder (dev builds, WSL, tests). A failure only logs a
 * warning, so a skill problem never stops the provider from starting.
 */
export const syncProviderCoreSkills = Effect.fn("syncProviderCoreSkills")(function* (input: {
  readonly provider: "Codex" | "Antigravity";
  readonly targetDir: string;
}) {
  const path = yield* Path.Path;
  const pluginDir = (yield* HostProcess.Environment).LEONIDAS_CORE_SKILLS_PLUGIN_DIR?.trim();
  if (!pluginDir) return;
  const report = yield* syncCoreSkillLinks({
    sourceDir: path.join(pluginDir, "skills"),
    targetDir: input.targetDir,
  }).pipe(
    syncLock.withPermit,
    Effect.tapError((cause) =>
      Effect.logWarning(`Could not sync the core skills to ${input.provider}`, cause),
    ),
    Effect.option,
  );
  if (report._tag === "None") return;
  const kept = report.value.outcomes.filter((o) => o.action === "kept-edited");
  if (kept.length > 0) {
    yield* Effect.logInfo(
      `${input.provider} core skills left as you edited them: ${kept.map((o) => o.name).join(", ")}`,
    );
  }
});
