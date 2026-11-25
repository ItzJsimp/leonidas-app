import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { symlinksSupported } from "@t3tools/shared/testing/symlinks";

import {
  CORE_SKILLS_MANIFEST_FILE,
  CORE_SKILLS_STAGING_DIR,
  syncCoreSkillLinks,
} from "./CoreSkillLinks.ts";

const setup = Effect.fn("CoreSkillLinks.test.setup")(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fileSystem.makeTempDirectoryScoped({ prefix: "core-skill-links-" });
  const sourceDir = path.join(root, "source");
  const targetDir = path.join(root, "home", "skills");
  const write = (relative: string, text: string) =>
    Effect.gen(function* () {
      const file = path.join(root, relative);
      yield* fileSystem.makeDirectory(path.dirname(file), { recursive: true });
      yield* fileSystem.writeFileString(file, text);
    });
  const read = (relative: string) => fileSystem.readFileString(path.join(root, relative));
  const sync = () => syncCoreSkillLinks({ sourceDir, targetDir });
  const actions = (report: Effect.Success<ReturnType<typeof sync>>) =>
    Object.fromEntries(report.outcomes.map((o) => [o.name, o.action]));
  return { fileSystem, path, root, write, read, sync, actions, targetDir };
});

it.layer(NodeServices.layer)("CoreSkillLinks", (it) => {
  describe("syncCoreSkillLinks", () => {
    it.effect("installs every core skill and records a manifest row", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const t = yield* setup();
          yield* t.write("source/alpha/SKILL.md", "alpha v1");
          yield* t.write("source/alpha/scripts/run.py", "print(1)");
          yield* t.write("source/beta/SKILL.md", "beta v1");
          const report = yield* t.sync();
          expect(t.actions(report)).toEqual({ alpha: "installed", beta: "installed" });
          expect(yield* t.read("home/skills/alpha/scripts/run.py")).toBe("print(1)");
          const manifest = JSON.parse(yield* t.read(`home/skills/${CORE_SKILLS_MANIFEST_FILE}`));
          expect(Object.keys(manifest.skills).toSorted()).toEqual(["alpha", "beta"]);
          expect(t.actions(yield* t.sync())).toEqual({ alpha: "unchanged", beta: "unchanged" });
        }),
      ),
    );

    it.effect("updates an untouched skill when the release changes it", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const t = yield* setup();
          yield* t.write("source/alpha/SKILL.md", "alpha v1");
          yield* t.sync();
          yield* t.write("source/alpha/SKILL.md", "alpha v2");
          expect(t.actions(yield* t.sync())).toEqual({ alpha: "updated" });
          expect(yield* t.read("home/skills/alpha/SKILL.md")).toBe("alpha v2");
        }),
      ),
    );

    it.effect("never overwrites a skill the user edited", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const t = yield* setup();
          yield* t.write("source/alpha/SKILL.md", "alpha v1");
          yield* t.sync();
          yield* t.write("home/skills/alpha/SKILL.md", "my edit");
          yield* t.write("source/alpha/SKILL.md", "alpha v2");
          expect(t.actions(yield* t.sync())).toEqual({ alpha: "kept-edited" });
          expect(yield* t.read("home/skills/alpha/SKILL.md")).toBe("my edit");
          // Still reported on the next run, because the manifest keeps the old hash.
          expect(t.actions(yield* t.sync())).toEqual({ alpha: "kept-edited" });
        }),
      ),
    );

    it.effect("never touches a user skill that has a core name", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const t = yield* setup();
          yield* t.write("home/skills/alpha/SKILL.md", "user alpha");
          yield* t.write("source/alpha/SKILL.md", "core alpha");
          expect(t.actions(yield* t.sync())).toEqual({ alpha: "kept-user" });
          expect(yield* t.read("home/skills/alpha/SKILL.md")).toBe("user alpha");
          const manifest = JSON.parse(yield* t.read(`home/skills/${CORE_SKILLS_MANIFEST_FILE}`));
          expect(manifest.skills).toEqual({});
        }),
      ),
    );

    it.effect.skipIf(!symlinksSupported)("leaves a linked skill folder alone", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const t = yield* setup();
          yield* t.write("source/alpha/SKILL.md", "alpha");
          yield* t.write("repo/keep.md", "keep");
          yield* t.fileSystem.makeDirectory(t.path.join(t.root, "home"), { recursive: true });
          yield* t.fileSystem.symlink(t.path.join(t.root, "repo"), t.targetDir);
          expect(t.actions(yield* t.sync())).toEqual({});
          expect(yield* t.fileSystem.readDirectory(t.path.join(t.root, "repo"))).toEqual([
            "keep.md",
          ]);
        }),
      ),
    );

    it.effect("finishes an install that stopped part way", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const t = yield* setup();
          yield* t.write("source/alpha/SKILL.md", "alpha");
          // The state after a stop: the row is saved, the folder is still in staging.
          yield* t.write(
            `home/skills/${CORE_SKILLS_MANIFEST_FILE}`,
            '{"version":1,"skills":{"alpha":"abc"}}',
          );
          yield* t.write(`home/${CORE_SKILLS_STAGING_DIR}/new/alpha/SKILL.md`, "half");
          expect(t.actions(yield* t.sync())).toEqual({ alpha: "installed" });
          expect(yield* t.read("home/skills/alpha/SKILL.md")).toBe("alpha");
          const staging = t.path.join(t.root, "home", CORE_SKILLS_STAGING_DIR);
          expect(yield* t.fileSystem.exists(staging)).toBe(false);
          expect(t.actions(yield* t.sync())).toEqual({ alpha: "unchanged" });
        }),
      ),
    );

    it.effect("removes a skill that left the core set, and keeps an edited one", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const t = yield* setup();
          yield* t.write("source/alpha/SKILL.md", "alpha");
          yield* t.write("source/beta/SKILL.md", "beta");
          yield* t.write("source/gamma/SKILL.md", "gamma");
          yield* t.sync();
          yield* t.write("home/skills/gamma/SKILL.md", "my gamma");
          yield* t.fileSystem.remove(t.path.join(t.root, "source/beta"), { recursive: true });
          yield* t.fileSystem.remove(t.path.join(t.root, "source/gamma"), { recursive: true });
          const actions = t.actions(yield* t.sync());
          expect(actions).toEqual({ alpha: "unchanged", beta: "removed", gamma: "kept-edited" });
          expect(yield* t.fileSystem.exists(t.path.join(t.targetDir, "beta"))).toBe(false);
          expect(yield* t.read("home/skills/gamma/SKILL.md")).toBe("my gamma");
          const manifest = JSON.parse(yield* t.read(`home/skills/${CORE_SKILLS_MANIFEST_FILE}`));
          expect(Object.keys(manifest.skills)).toEqual(["alpha"]);
        }),
      ),
    );
  });
});
