import * as Effect from "effect/Effect";
import * as Base64 from "effect/encoding/Base64";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

// Keep in sync with CORE_SKILLS_BUNDLE_FILE in scripts/core-skills-plugin.ts.
export const CORE_SKILLS_BUNDLE_FILE = "core-skills-plugin.json";

const CoreSkillsBundle = Schema.Struct({
  id: Schema.String.check(Schema.isPattern(/^[0-9a-f]{16}$/)),
  files: Schema.Record(Schema.String, Schema.String),
});
const decodeBundle = Schema.decodeUnknownEffect(Schema.fromJsonString(CoreSkillsBundle));

class CoreSkillsBundleError extends Schema.TaggedError<CoreSkillsBundleError>()(
  "CoreSkillsBundleError",
  { message: Schema.String },
) {}

/**
 * Unpacks the core skills bundle (one file, so the Windows payload stays small) into
 * `<cacheDir>/<id>` and returns that plugin folder. A folder that already holds the same id is
 * reused, and older ids are removed. Fails when the bundle is invalid.
 */
export const unpackCoreSkillsBundle = Effect.fn("desktop.unpackCoreSkillsBundle")(
  function* (input: { readonly bundlePath: string; readonly cacheDir: string }) {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const bundle = yield* fileSystem
      .readFileString(input.bundlePath)
      .pipe(Effect.flatMap(decodeBundle));
    const target = path.join(input.cacheDir, bundle.id);
    const manifest = path.join(target, ".claude-plugin", "plugin.json");
    if (yield* fileSystem.exists(manifest)) return target;

    const partial = path.resolve(`${target}.partial-${process.pid}`);
    yield* fileSystem.remove(partial, { recursive: true, force: true });
    for (const [relativePath, base64] of Object.entries(bundle.files)) {
      const file = path.resolve(partial, relativePath);
      // The bundle is ours, but a path that leaves the folder must never be written.
      if (!file.startsWith(`${partial}${path.sep}`)) {
        return yield* new CoreSkillsBundleError({ message: `unsafe path ${relativePath}` });
      }
      const bytes = Base64.decode(base64);
      if (Result.isFailure(bytes)) {
        return yield* new CoreSkillsBundleError({ message: `invalid base64 in ${relativePath}` });
      }
      yield* fileSystem.makeDirectory(path.dirname(file), { recursive: true });
      yield* fileSystem.writeFile(file, bytes.success);
    }
    if (!(yield* fileSystem.exists(path.join(partial, ".claude-plugin", "plugin.json")))) {
      return yield* new CoreSkillsBundleError({
        message: "bundle has no .claude-plugin/plugin.json",
      });
    }
    yield* fileSystem.remove(target, { recursive: true, force: true });
    yield* fileSystem.rename(partial, target);
    for (const entry of yield* fileSystem.readDirectory(input.cacheDir)) {
      if (entry !== bundle.id) {
        yield* fileSystem
          .remove(path.join(input.cacheDir, entry), { recursive: true, force: true })
          .pipe(Effect.ignore);
      }
    }
    return target;
  },
);
