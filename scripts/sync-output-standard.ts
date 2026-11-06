import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import { LEONIDAS_OUTPUT_STANDARD } from "../packages/provider-core/src/server/outputStandard.ts";

const start = "<!-- leonidas-output-standard:start -->";
const end = "<!-- leonidas-output-standard:end -->";
const block = `${start}\n${LEONIDAS_OUTPUT_STANDARD}\n${end}`;
// AIOS overlays get a pointer, not the full text: the harness already injects the standard.
const pointer = `${start}\nReply shape: Leonidas injects its render contract and the selected reply style into every session. The default style is Leonidas. Presets live in \`.agents/reply-styles/<slug>.md\`. Source: \`packages/provider-core/src/server/outputStandard.ts\`. Do not restate them here.\n${end}`;
const normalize = (value: string) => value.replaceAll("\r\n", "\n");

/** Update only managed copies and overlay blocks, preserving personal instructions and backups. */
export async function syncOutputStandard(input: {
  projectRoot: string;
  aiosRoots?: string[];
  check?: boolean;
}) {
  return Effect.runPromise(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const read = (file: string) =>
        Effect.catchIf(
          fs.readFileString(file),
          (error) => PlatformError.isPlatformError(error) && error.reason._tag === "NotFound",
          () => Effect.succeed(""),
        );
      const files = new Map<string, string>();
      files.set(
        path.join(input.projectRoot, ".agents/rules/output-standard.md"),
        `# Output standard (generated from the harness)\n\n${block}\n`,
      );
      const skillRoot = path.join(input.projectRoot, ".agents/skills/leonidas-canvas");
      // The harness injects the standard, so canvas files carry only its pointer.
      const skillFiles = (yield* fs.readDirectory(skillRoot, { recursive: true })).filter((file) =>
        /\.(?:md|html)$/.test(file),
      );
      for (const root of input.aiosRoots ?? []) {
        if (path.resolve(root) === path.resolve(input.projectRoot)) continue;
        for (const entry of ["AGENTS.md", "CLAUDE.md"]) {
          const file = path.join(root, entry);
          const instructions = yield* read(file);
          if (instructions && !instructions.includes(".agents/rules/leonidas-code-overlay.md")) {
            files.set(
              file,
              `${instructions.trimEnd()}\n\n<!-- Leonidas overlay loader -->\nBefore acting in Leonidas, read [.agents/rules/leonidas-code-overlay.md](.agents/rules/leonidas-code-overlay.md).\n@.agents/rules/leonidas-code-overlay.md\n`,
            );
          }
        }
        const overlay = path.join(root, ".agents/rules/leonidas-code-overlay.md");
        const previous = normalize(yield* read(overlay));
        const a = previous.indexOf(start);
        const b = previous.indexOf(end);
        if (a < 0 !== b < 0 || (a >= 0 && b < a))
          return yield* Effect.die(new Error(`Broken managed block in ${overlay}`));
        files.set(
          overlay,
          a < 0
            ? `${previous.trimEnd() || "# Leonidas: shared operating layer"}\n\n${pointer}\n`
            : `${previous.slice(0, a)}${pointer}${previous.slice(b + end.length)}`,
        );
        for (const file of skillFiles)
          files.set(
            path.join(root, ".agents/skills/leonidas-canvas", file),
            yield* read(path.join(skillRoot, file)),
          );
      }
      const drift: string[] = [];
      for (const [file, expected] of files) {
        const original = yield* read(file);
        if (normalize(original) === normalize(expected)) continue;
        drift.push(file);
        if (input.check) continue;
        if (original) {
          const backup = yield* fs.makeTempDirectory({ prefix: "leonidas-output-standard-" });
          yield* fs.writeFileString(path.join(backup, path.basename(file)), original);
        }
        yield* fs.makeDirectory(path.dirname(file), { recursive: true });
        yield* fs.writeFileString(
          file,
          original.includes("\r\n") ? normalize(expected).replaceAll("\n", "\r\n") : expected,
        );
      }
      return drift;
    }).pipe(Effect.provide(NodeServices.layer)),
  );
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const roots: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--aios-root" && args[i + 1]) roots.push(args[++i]!);
    else if (args[i] !== "--check") throw new Error(`Unknown or incomplete argument: ${args[i]}`);
  }
  const check = args.includes("--check");
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const projectRoot = yield* path.fromFileUrl(new URL("..", import.meta.url));
    const drift = yield* Effect.promise(() =>
      syncOutputStandard({
        projectRoot,
        aiosRoots: roots.map((root) => path.resolve(root)),
        check,
      }),
    );
    yield* Console.log(
      `${check && drift.length ? "FAIL" : "PASS"} output standard: ${drift.length} ${check ? "drifted" : "updated"} copies`,
    );
    if (check && drift.length) {
      yield* Console.error(drift.join("\n"));
      globalThis.process.exitCode = 1;
    }
  }).pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain);
}
